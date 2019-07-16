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
  var recordedTweets = [];
  var interval = null;

  socket.on('hashtag', function (data) {
    if (interval) {
      clearInterval(interval);
      interval = null;
    }
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
      var statuses = data.statuses;
      statuses.reverse();
      for (tweet in statuses) {
        if (allowRetweets || statuses[tweet].text.slice(0,2) !== 'RT') {
          if (!recordedTweets.includes(statuses[tweet].id)) {
            socket.emit('tweets', { detail: statuses[tweet] });
            addTweet(recordedTweets, statuses[tweet]);
          }
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
            if (!recordedTweets.includes(tweet.id)) {
              socket.emit('tweets', { detail: tweet });
              addTweet(recordedTweets, tweet);
            }
          }
        }
      }
    });

    // refresh tweet listing using the search api every 30 seconds
    interval = setInterval(function() {
      console.log('refreshing tweets using search api');
      tw.get('search/tweets', { q: hashtag, count: 100, result_type: 'recent'}, function(err, data, response) {
        var statuses = data.statuses;
        if (statuses) {
          statuses.reverse();
          for (tweet in statuses) {
            if (allowRetweets || statuses[tweet].text.slice(0,2) !== 'RT') {
              if (!recordedTweets.includes(statuses[tweet].id)) {
                socket.emit('tweets', { detail: statuses[tweet] });
                addTweet(recordedTweets, statuses[tweet]);
              }
            }
          }
        } else {
          console.log(err.statusCode, err.statusMessage);
        }
      });
    }, 10000);

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
      tw.get('search/tweets', { q: hashtag, count: 50, result_type: 'recent'}, function(err, data, response) {
        var statuses = data.statuses;
        statuses.reverse();
        for (tweet in statuses) {
          if (allowRetweets || statuses[tweet].text.slice(0,2) !== 'RT') {
            if (!recordedTweets.includes(statuses[tweet].id)) {
              socket.emit('tweets', { detail: statuses[tweet] });
              addTweet(recordedTweets, statuses[tweet]);
            }
          }
        }
      });
      console.log('reconnecting. statusCode:', res.statusCode, 'waiting for ', interval, 'milliseconds');
      console.log(res.statusCode, res.statusMessage);
    });

  });

});

function addTweet (list, tweet) {
  var id = tweet.id;
  if (!list.includes(id)) {
    list.push(id);
  }
}
