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
	access_token_secret: creds.access_token_secret
});

app.get('/', function (req, res) {
	res.sendFile(__dirname + '/index.html');
});

const PORT = process.env.PORT || 3000;

server.listen(PORT);

io.sockets.on('connection', function (socket) {
  var hashtag = '';
  var twStream;
  var allowRetweets;

  socket.on('hashtag', function (data) {

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

    twStream = tw.stream(
      'statuses/filter',
      { track: hashtag }
    );

    twStream.on('tweet', function(tweet) { // check for hashtag in tweet and send to frontend socket if found
      if((tweet && tweet.text.match(hashtag)) || (tweet.extended_tweet && tweet.extended_tweet.full_text.match(hashtag))) {
        if (allowRetweets || tweet.text.slice(0,2) !== 'RT') {
          socket.emit('tweets', { detail: tweet });
        }
      }
    });

    twStream.on('error', function(error) {
      throw error;
    });

  });

});
