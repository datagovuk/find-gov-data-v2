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
  const location = req.query['location']
  orgTypes = req.query['org-type'] || ''

  // Remove extraneous org-type=_unchecked that appears due to prototype-kit
  // issue.  We don't want it....
  if (orgTypes && Array.isArray(orgTypes)) {
    orgTypes = orgTypes.filter((item)=>{return item != '_unchecked'})
  }

  // Copy the query because we don't want to provide a potentially modified
  // version back to the template.
  var query_string = query
  var sortBy = req.query['sortby']
  var offset = 0
  var limit = 10

  if (location) {
    query_string += " " + location
    query_string = query_string.trim()
  }

  // If there is no query string, we will default to showing the most recent
  // datasets as we can't have relevance when there is nothing to check
  // relevance against. At the same time, we want to match everything if the
  // user has provided no terms so we will search for *
  if (query_string == ""){
    sortBy = 'recent'
    query_string = "*"
  }

  // TODO: When we have an organisation_type to filter on, we will need to change
  // the query_string to append " organisation_type:X" where X is the short
  // name of the organisation. We don't yet have this info in the search index.


  var esQuery = {
    index: process.env.ES_INDEX,
    body: {
      query: {
        query_string: {
          query: query_string,
          fields: [
                   "summary^2", "title^3", "description^1",
                   "location1^2", "location2^2", "location3^2",
                   "_all"
                  ],
          default_operator: "and"
        }
      },
      from: offset,
      size: limit
    }
  }

  // Set the sort field if the user has selected one in the UI, otherwise
  // we will default to relevance (using _score).  We don't have popularity
  // scores yet, so we'll cheat and use the name of the dataset
  switch(sortBy) {
      case "recent":
          esQuery.sort = "last_edit_date:desc"
          break;
      case "viewed":
          esQuery.sort = "name:asc"
          break;
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
        results: processEsResponse(esResponse),
        numResults: esResponse.hits.total
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

    const cmpStrings = (s1, s2) => s1 < s2 ? 1 : (s1 > s2 ? -1 : 0)

    const groupByDate = function(result){
      var groups = []


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
      return groups
        .map(group=> {
          var newGroup = group
          newGroup.datafiles =
            group.datafiles.sort((g1, g2) => cmpStrings(g1.start_date, g2.start_date))
          return newGroup;
        })
        .sort((g1, g2) => cmpStrings(g1.year, g2.year))
    }

    if (esError) {
      throw esError
    } else {
      res.render('dataset', {
        result: result,
        groups: groupByDate(result)
      })
      // console.log(result)
    }
  })
})

module.exports = router
