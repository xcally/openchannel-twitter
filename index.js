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

app.use(morgan('VERBOSE [:datetime] [REQUEST] [OPENCHANNEL-TWITTER] - :method :remote-address :remote-user :url :status :response-time ms - :res[content-length]'));

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
  // logger.info('message is', msg);
});

stream.on('error', function(error) {
  logger.info('Twitter error:', error);
});

function sendData(data){
    return request({
      method: 'POST',
      uri: config.url,
      body: data,
      json: true
    });
}

function sendTweetData(tweet){

    var data = {
      from: tweet.user.screen_name,
      body: tweet.text,
      name: tweet.user.name,
      firstName: tweet.user.name,
      threadId: tweet.in_reply_to_status_id_str || tweet.id_str,
      phone: 'none',
      mapKey: 'twitter'
    };

    if (tweet.entities.media && tweet.entities.media.length) {
      data.body += ' (Attachments are not yet supported!)';
    }

    return sendData(data);
}

if(config.enableTweets){

    stream.on('tweet', function(tweet) {
        logger.info('tweet', tweet.id);
      if(tweet.user.screen_name === config.screen_name && tweet.in_reply_to_screen_name !== null){
          //reply from page, do not send to motion!
          return;
      }
      return sendTweetData(tweet);
    });

}

stream.on('direct_message', function(msg) {

  if (msg.direct_message) {
    // Check sender
    if (msg.direct_message.sender.screen_name != config.screen_name) {
      var data = {
        from: msg.direct_message.sender.screen_name,
        body: msg.direct_message.text,
        name: msg.direct_message.sender.name,
        firstName: msg.direct_message.sender.name,
        phone: 'none',
        mapKey: 'twitter'
      };

      if (msg.direct_message.entities.media && msg.direct_message.entities.media.length) {
        data.body += ' (Attachments are not yet supported!)';
      }

      return sendData(data);

    }
  }
});

function handleResponse(error, data, response, res) {
  if (!error) {
    logger.info(data);
    logger.info(response);
    logger.info('Reply sent');
    res.status(200).send(data);
  } else {
    logger.error('Reply failed:', error);
    res.status(500).send(error);
  }
}

app.post('/sendMessage', function(req, res) {
  try {

    var screen_name = req.body.Contact ? req.body.Contact.twitter : req.body.to;
    var text = req.body.body;

    if (req.body.AttachmentId) {
      var data = {
        from: screen_name,
        body: 'AUTO-RESPONSE : Attachments are not yet supported!',
        mapKey: 'twitter'
      };

      return sendData(data);

    } else {
        if(req.body.Interaction && req.body.Interaction.threadId){
            logger.info('threadId', req.body.Interaction.threadId);
            if(text.indexOf('@' + screen_name) !== 0){//I have to mention the user that created the original tweet referred by the threadId
                text = util.format('@%s %s', screen_name, text);
            }
            client.post('statuses/update', {
              status: text,
              in_reply_to_status_id: req.body.Interaction.threadId
          }, function(error, data, response){
              return handleResponse(error, data, response, res);
          });
        }
        else{
            client.get('users/show', {
                screen_name: screen_name
            }, function(error, data, response){
                if(error){
                    return handleResponse(error, null, null, res);
                }
                client.post('direct_messages/events/new', {
                  event: {
                    type: 'message_create',
                    message_create: {
                      target: {
                        recipient_id: data.id
                      },
                      message_data: {
                        text: text,
                      }
                    }
                  }
                }, function(error, data, response){
                  return handleResponse(error, data, response, res);
              });
          });
        }
    }
  } catch (e) {
    logger.error('Reply error:', JSON.stringify(e));
  }
});
