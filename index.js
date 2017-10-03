var express = require('express'),
  bodyParser = require('body-parser'),
  request = require('request-promise'),
  fs = require('fs'),
  twitter = require('twit'),
  logger = require('./logger.js')('openchannel-twitter'),
  moment = require('moment'),
  morgan = require('morgan'),
  util = require('util');


var app = express();

// Configuration
try {
  var configJSON = fs.readFileSync(__dirname + '/config.json');
  var config = JSON.parse(configJSON.toString());
} catch (e) {
  logger.error('File config.json not found or invalid: ' + e.message);
  process.exit(1);
}

var port = config.port || 3002;

//bodyParser to get POST parameters.
app.use(bodyParser.urlencoded({
  extended: false
}));
app.use(bodyParser.json());

morgan.token('remote-address', function(req, res) {
  return req.headers['x-forwarded-for'] ? req.headers['x-forwarded-for'] : req.connection.remoteAddress || req.ip;
});
morgan.token('datetime', function(req, res) {
  return moment().format('YYYY-MM-DD HH:mm:ss');
});

app.use(morgan('VERBOSE [:datetime] [REQUEST] [OPENCHANNEL-FACEBOOK] - :method :remote-address :remote-user :url :status :response-time ms - :res[content-length]'));

//Start server
app.listen(port, function() {
  logger.info('Service listening on port ' + port);
});

var client = new twitter({
  consumer_key: config.consumer_key,
  consumer_secret: config.consumer_secret,
  access_token: config.access_token,
  access_token_secret: config.access_token_secret
});

var stream = client.stream('user');

stream.on('connect', function(request) {
  logger.info('Twitter connect...');
});

stream.on('connected', function(response) {
  logger.info('Twitter connected.');
});

stream.on('disconnect', function(disconnectMessage) {
  logger.info('Twitter disconnect', disconnectMessage);
});

stream.on('warning', function(warning) {
  logger.info('Twitter warning:', warning);
});

stream.on('message', function(msg) {
  //logger.info(msg);
});

stream.on('direct_message', function(msg) {

  if (msg.direct_message) {
    // Check sender
    if (msg.direct_message.sender.screen_name != config.screen_name) {
      var data = {
        from: msg.direct_message.sender.screen_name,
        body: msg.direct_message.text,
        name: msg.direct_message.sender.name,
        firstName: msg.direct_message.sender.name,
        phone:'none',
        mapKey: 'twitter'
      };

      return request({
        method: 'POST',
        uri: config.url,
        body: data,
        json: true
      });
    }
  }
});

app.post('/sendMessage', function(req, res) {
  try {
    
    var screen_name = req.body.Contact ? req.body.Contact.twitter : req.body.to;
    var text = req.body.body;

    client.post('direct_messages/new', {
      screen_name: screen_name,
      text: text
    }, function(error, data, response) {
      if (!error) {
        logger.info(data);
        logger.info(response);
        logger.info('Reply sent');
        res.status(200).send(data);
      } else {
        logger.error('Reply failed:', error);
        res.status(500).send(error);
      }
    });
  } catch (e) {
    logger.error('Reply error:', e);
  }
});
