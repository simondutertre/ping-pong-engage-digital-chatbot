const _ = require('lodash')

const enedisDirections = require('./directions')

function isSelf (event) {
  return _.get(event, 'resource.metadata.status') === 'user_initiated'
}



const geoCategoryId = '5d516bb3dbddbb5ebc9a128e'
const rcId = '5d5c170d526722572d05d846'
const commId = '5d5c1abf526722572d05d973'
const linkyId = '5d5c1c2e52672239b7a49d67'
const directionParisId = '5d5d2fb90e69dc3d1f222818'
const twitterAccountId = '1156582247794974720'

// match first occurence of french postal code in a string
const regPostalCode = /[0-9]{5}/
const ML_URL = 'https://3yyqqih8mh.execute-api.eu-central-1.amazonaws.com/default/enedisMain'

const addDirection = obj => {
  const postalCode = getPostalCode(obj.body)

  if (!postalCode) return obj

  const departmentCode = postalCode.slice(0, 2)
  const enedisDirection = enedisDirections.find(direction => direction.departments.includes(departmentCode))

  if (!enedisDirection) return obj

  return {
    ...obj,
    enedisDirection
  }
}

const format = event => ({
  content_thread_id: "",
  messages: []
})

const getPostalCode = string => {
  const result = regPostalCode.exec(string)

  return result ? result[0] : null
}

const publicTweetRes = id => `Bonjour, afin que nous puissions traiter au mieux votre demande, merci de nous communiquer votre code postal (5 chiffres) en message privé.
https://twitter.com/messages/compose?recipient_id=${id}`

const dmTweetRes = () => 'Bonjour, afin que nous puissions traiter au mieux votre demande, merci de nous communiquer votre code postal (5 chiffres).'




exports.onEvent = async ({
  event,
  client,
  handled // hanlded by prev skills
}) => {
  if (handled) return
  if (isSelf(event)) return

  console.log(JSON.stringify(event, null, 3))
  try {
    // Get all contents by event thread id ( last 30 - default limit )
    const { data: { records } } = await client.get(`/1.0/contents?q=thread:"${event.resource.metadata.thread_id}" order:created_at.desc`)

    // Reverse() them, because we receive them from most recent, and ML takes it from latest
    const { data: mlResponse } = await axios.post(ML_URL, records.reverse())
    const { value: shouldReply } = mlResponse.entities.find(entity => entity.key === 'ShouldReply')
    const postalCode = getPostalCode(event.resource.metadata.body)

    if (event.resource.metadata.body.includes('@enedis_paris')) {
      await client.put(`/1.0/contents/${event.resource.id}/update_categories?category_ids[]=${directionParisId}`)
    }
    // else if(postalCode) {
    //   await client.put(`/1.0/contents/${event.resource.id}/update_categories?category_ids[]=${directionParisId}`)
    // }

    if(!shouldReply) return

    const { value: motif } = mlResponse.entities.find(entity => entity.key === 'Motif')

    switch (motif.slice(0, 2)) {
      case 'RA' || 'RB':
        await client.put(`/1.0/contents/${event.resource.id}/update_categories?category_ids[]=${rcId}`)
        break
      case 'CA' || 'CB':
        await client.put(`/1.0/contents/${event.resource.id}/update_categories?category_ids[]=${commId}`)
        break
      case 'LI01':
        await client.put(`/1.0/contents/${event.resource.id}/update_categories?category_ids[]=${linkyId}`)
        break
    }

    switch (event.resource.type) {
      case 'twtr/tweet':
        return await client.reply(event, {
          body: publicTweetRes(twitterAccountId)
        })
      case 'twtr/private_tweet':
        return await client.reply(event, {
          body: dmTweetRes()
        })

      default: return await client.reply(event, {
        body: 'Bonjour'
      })
    }

  } catch(err) {
    console.log("Caught Error : ", err)
  }
}
