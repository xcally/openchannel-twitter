var express = require('express'),
    bodyParser = require('body-parser'),
    request = require('request-promise'),
    fs = require('fs'),
    twitter = require('twit');

var app = express();

// Configuration
try {
    var configJSON = fs.readFileSync(__dirname + '/config.json');
    var config = JSON.parse(configJSON.toString());
} catch (e) {
    console.error('File config.json not found or is invalid: ' + e.message);
    process.exit(1);
}

var port = config.port || 3002;

//bodyParser to get POST parameters.
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(bodyParser.json());

//Start server
app.listen(port, function() {
    console.log('Service listening on port ' + port);
});

var client = new twitter({
    consumer_key: config.consumer_key,
    consumer_secret: config.consumer_secret,
    access_token: config.access_token,
    access_token_secret: config.access_token_secret
});

var stream = client.stream('user');

stream.on('connect', function(request) {
    console.log('Twitter connect...');
});

stream.on('connected', function(response) {
    console.log('Twitter connected.');
});

stream.on('disconnect', function(disconnectMessage) {
    console.log('Twitter disconnect', disconnectMessage);
});

stream.on('warning', function(warning) {
    console.log('Twitter warning:', warning);
});

stream.on('message', function(msg) {
    //console.log(msg);
});

stream.on('direct_message', function(msg) {

    if (msg.direct_message) {
        // Check sender
        if (msg.direct_message.sender.screen_name != config.screen_name) {

            var data = {
                from: msg.direct_message.sender.screen_name,
                body: msg.direct_message.text,
                name: msg.direct_message.sender.name
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
    var screen_name = req.body.to;
    var text = req.body.body;

    client.post('direct_messages/new', {
        screen_name: screen_name,
        text: text
    }, function(error, data, response) {
        if (!error) {
            console.log(data);
            console.log(response);
            console.log('Reply sent');
            res.status(200).send(data);
        } else {
            console.log('Reply failed with ', error);
            res.status(500).send(error);
        }
    });
});
