var twit = require('twit'),
  	creds = require('./creds.js'),
  	express = require('express'),
  	app = express(),
  	server = require('http').createServer(app),
  	io = require('socket.io').listen(server);

var tw = new twit({ // create new twit object using twitter dev credentials
	consumer_key: creds.consumer_key,
	consumer_secret: creds.consumer_secret,
	access_token: creds.access_token_key,
	access_token_secret: creds.access_token_secret,
  request_options: {
    proxy: '165.227.95.218:3128'
  }
});

app.get('/', function (req, res) {
	res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;

server.listen(PORT);

var twStream = tw.stream( // have only one stream instance per server
  'statuses/filter',
  { track: '#placeholder' } // have to put something here to track otherwise twitter returns an error
);
var emitTweets = false;


io.sockets.on('connection', function (socket) {
  var hashtag = '';
  var allowRetweets;
  var error420 = 0;
  var errorOther = 0;

  socket.on('hashtag', function (data) {
    if (emitTweets === false) {
      emitTweets = true;
    }
    allowRetweets = data.retweets;

    if (data.query[0] === '#') { // add '#', but only if string does not already contain it
      hashtag = data.query;
    } else {
      hashtag = '#' + data.query;
    }

    // initially populate frontend with 50 most recent tweets fitting the search
    const searchQuantity = allowRetweets ? 50 : 100; // allow larger search if retweets are prohibited to ensure a sufficiently large amount of data
    tw.get('search/tweets', { q: hashtag, count: searchQuantity, result_type: 'recent'}, function(err, data, response) {
      for (tweet in data.statuses) {
        if (allowRetweets || data.statuses[tweet].text.slice(0,2) !== 'RT') {
          socket.emit('tweets', { detail: data.statuses[tweet] });
        }
      }
    });

    if (twStream) { // simply change the hashtag being tracked if the stream already exists
      if (twStream.reqOpts.form.track !== hashtag) {
        twStream.stop();
        twStream.reqOpts.form.track = hashtag;
      }
      twStream.start();
    }

    twStream.on('tweet', function(tweet) { // check for hashtag in tweet and send to frontend socket if found
      if (emitTweets) {
        if((tweet && tweet.text.match(hashtag)) || (tweet.extended_tweet && tweet.extended_tweet.full_text.match(hashtag))) {
          if (allowRetweets || tweet.text.slice(0,2) !== 'RT') {
            socket.emit('tweets', { detail: tweet });
          }
        }
      }
    });

    twStream.on('error', function(error) {
      throw error;
    });

    twStream.on('disconnect', function (disconn) {
      console.log('disconnect');
    });

    twStream.on('connect', function (conn) {
      console.log('connecting');
    });

    twStream.on('reconnect', function (reconn, res, interval) {
      console.log('reconnecting. statusCode:', res.statusCode, 'waiting for ', interval, 'milliseconds');
    });

  });

});
