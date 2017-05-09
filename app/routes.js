var express = require('express')
var router = express.Router()
var data = require('./data.js')
var elasticsearch = require('elasticsearch')

const esClient = new elasticsearch.Client({
  host: process.env.ES_HOSTS,
//  log: 'trace'
})

// Deliver all the data to every template
router.use(function(req,res,next){
  res.locals.data = data
  next()
})

// Route index page
router.get('/', function (req, res) {
  res.render('index')
})

router.use(function(req,res,next){
  res.locals.data = data
  next()
})

const monthNames =  {'01': 'January', '02': 'February', '03': 'March', '04': 'April', '05': 'May', '06': 'June', '07': 'July', '08': 'August', '09': 'September', '10': 'October', '11': 'November', '12': 'December'};
const processEsResponse = results =>
  results.hits.hits
    .map(result => {
      var newResult = result._source
      const day = newResult.last_edit_date.substr(8,2)
      const month = monthNames[newResult.last_edit_date.substr(5,2)]
      const year = newResult.last_edit_date.substr(0,4)
      newResult.location = [ newResult.location1, newResult.location2, newResult.location3]
        .filter(loc => loc)
        .join(',')
      newResult.last_updated = day + ' ' + month + ' ' + year
      if (newResult.update_frequency == 'yearly') {
        var int = Number(interval)
        year_int += 1
        newResult.expected_update = day + ' ' + month + ' ' + year_int
      }
      else if (newResult.update_frequency == '') {
        newResult.expected_update = 'Not known'
      }
       return newResult
    })


router.get('/search-results', function(req, res, next) {
  const query = req.query.q
  const sortBy = req.query['sortby']
  const location = req.query['location']
  orgTypes = req.query['org-type'] || ''

  // Remove extraneous org-type=_unchecked that appears due to prototype-kit
  // issue.  We don't want it....
  if (orgTypes && Array.isArray(orgTypes)) {
    orgTypes = orgTypes.filter((item)=>{return item != '_unchecked'})
  }

  const shoulds = []
  if (query) shoulds.push(
    { match: { title: query } },
    { match: { summary: query } },
    { match: { description: query } }
  )

  if (location) shoulds.push(
    { match: { location1: location } },
    { match: { location2: location } },
    { match: { location3: location } }
  )

  const esQuery = {
    index: process.env.ES_INDEX,
    body: {
      query: {
        bool: {
          should: shoulds
        }
      }
    }
  }

  esClient.search(esQuery, (esError, esResponse) => {
    if (esError) {
      throw esError
    } else {
      res.render('search-results', {
        central: orgTypes.indexOf('central-gov') !== -1,
        local: orgTypes.indexOf('local-auth') !== -1,
        bodies: orgTypes.indexOf('bodies') !== -1,
        query: query,
        orgTypes: orgTypes,
        sortBy: ['best', 'recent', 'viewed'].indexOf(sortBy) !== -1 ? sortBy : '',
        location: location,
        locations: data.locations,
        results: processEsResponse(esResponse)
      })
    }
  })
})


router.get('/datasets/:name', function(req, res, next){
  const esQuery = {
    index: process.env.ES_INDEX,
    body: {
      query: { term: { name : req.params.name } }
    }
  }

  esClient.search(esQuery, (esError, esResponse) => {
    // console.log(processEsResponse(esResponse)[0])
    var result = processEsResponse(esResponse)[0]

    const groupByDate = function(result){
      var groups = []

      if (result.resources) {
        result.resources.forEach(function(datafile){
          if (datafile['start_date']) {
            const yearArray = groups.filter(yearObj => yearObj.year == datafile['start_date'].substr(0,4))
            if (yearArray.length === 0) {
              var group = {'year': "", 'datafiles':[]}
              group['year']= datafile['start_date'].substr(0,4)
              group['datafiles'].push(datafile)
              groups.push(group)
            } else {
              yearArray[0]['datafiles'].push(datafile)
            }
          }
        })
      }
      return groups
    }

    if (esError) {
      throw esError
    } else {
      res.render('dataset', {
        result: result,
        groups: groupByDate(result)
      })
    }
  })
})

module.exports = router
