var express = require('express')
var router = express.Router()

// Route index page
router.get('/', function (req, res) {
  res.render('index')
})

// add your routes here
var data = require('./data.js')


router.use(function(req,res,next){
  res.locals.data = data
  next()
})

module.exports = router
