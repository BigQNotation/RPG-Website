
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const mongodb = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;

const MONGO_URL = 'mongodb://localhost:27017/mydb';

const app = express();
const jsonParser = bodyParser.json();

app.use(express.static('public'));

let db = null;


var passport = require('passport')
  , LocalStrategy = require('passport-local').Strategy;

passport.use(new LocalStrategy(
  function(username, password, done) {
    User.findOne({ username: username }, function(err, user) {
      if (err) { return done(err); }
      if (!user) {
        return done(null, false, { message: 'Incorrect username.' });
      }
      if (!user.validPassword(password)) {
        return done(null, false, { message: 'Incorrect password.' });
      }
      return done(null, user);
    });
  }
));





async function startDbAndServer() {

  app.listen(3000, function () {
    console.log('Server listening on port 3000');

  });

  db = await mongodb.connect(MONGO_URL, { useNewUrlParser: true }) ;
    console.log("MongoDB connection established");
    collection = db.collection('classes1');
};

startDbAndServer();



async function onGetClassView(req, res) {
  res.sendFile(path.resolve(__dirname, 'public', 'index.html'));
}


app.get('/', onGetClassView);
