var express = require('express')
var router = express.Router()
var data = require('./data.js')
var elasticsearch = require('elasticsearch')

const esClient = new elasticsearch.Client({
  host: process.env.ES_HOSTS,
 // log: 'trace'
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
  const esQuery = {
    index: process.env.ES_INDEX,
    body: {
      query: {
        query_string : {
          query: query,
          fields: ["summary^2", "title^3", "description^1", "_all"],
          default_operator: "and"
        }
      },
    }
  }

  esClient.search(esQuery, (esError, esResponse) => {
      if (esError) {
        throw esError
      } else {
        res.render('search-results', {
          query: req.query.q,
          results: processEsResponse(esResponse)
        })
      }
    })
})

router.get('/datasets/:name', function(req, res, next){
  console.log(req.params.name);
  const esQuery = {
    index: process.env.ES_INDEX,
    body: {
      query: { term: { name : req.params.name } }
    }
  }

  esClient.search(esQuery, (esError, esResponse) => {
    // console.log(processEsResponse(esResponse)[0])
    if (esError) {
      throw esError
    } else {
      res.render('dataset', {
        result: processEsResponse(esResponse)[0]
      })
    }
  })
})

module.exports = router
