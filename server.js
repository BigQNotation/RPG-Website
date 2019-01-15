var express = require('express');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
//var db = require('./db');
var path = require('path')

const mongodb = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
const MONGO_URL = 'mongodb://localhost:27017/rpgdb';




// Connect to the User mongoDB
let db = null;
start_server();
  async function start_server(){
  db = await mongodb.connect(MONGO_URL);
  User =  db.collection('User');
};


// Cron-jobs
var schedule = require('node-schedule');

var j = schedule.scheduleJob('30 * * * * *', function(){
  console.log('Scheduled tasks finished.');

  User.find().snapshot().forEach(
    function (e) {
      // Update user's depletables
      if(e.stamina < 5){
        e.stamina = e.stamina+1;
      }
      if(e.health < 500){
        e.health = e.health + 100;
      }
      // Upper limit check
      if(e.health > 500){
        e.health = 500;
      }
      User.save(e);
    }
  )



});



// Configure the local strategy for use by Passport.
//
// The local strategy require a `verify` function which receives the credentials
// (`username` and `password`) submitted by the user.  The function must verify
// that the password is correct and then invoke `cb` with a user object, which
// will be set at `req.user` in route handlers after authentication.


  passport.use(new Strategy(
    function(username, password, cb) {
      User.findOne({ username: username }, function (err, user) {
        if (err) { return cb(err); }
        if (!user) {
          return cb(null, false, { message: 'Incorrect username.' });
        }
        if (!(user.password === password)) {
          return cb(null, false, { message: 'Incorrect password.' });
        }
        return cb(null, user);
      });
    }
  ));



// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  The
// typical implementation of this is as simple as supplying the user ID when
// serializing, and querying the user record by ID from the database when
// deserializing.
passport.serializeUser(function(user, cb) {
  cb(null, user.id);
});

passport.deserializeUser(function(id, cb) {
  User.findOne({id: id}, function (err, user) {
    if (err) { return cb(err); }
    cb(null, user);
  });
});




// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require('morgan')('combined'));
app.use(require('cookie-parser')());
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'keyboard cat', resave: false, saveUninitialized: false }));
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());

// Define routes.
app.get('/',
  function(req, res) {
    res.render('home', { user: req.user });
  });

app.get('/login',
  function(req, res){
    res.render('login');
  });

app.post('/login',
  passport.authenticate('local', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/logout',
  function(req, res){
    req.logout();
    res.redirect('/');
  });

app.get('/profile',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    res.render('profile', { user: req.user });
  });

app.get('/mines',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    res.render('mines', { user: req.user, message:"You enter the mine",loot:""});
  });


app.post('/mines',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res) {
  // if the user has enough stamina, user mines.
  if (req.user.stamina > 0){
    var new_stamina = req.user.stamina - 1;
    var new_mining_level = req.user.mining_level + 1;
    User.update({_id: req.user._id}, {$set: {stamina: new_stamina, mining_level: new_mining_level }});

    var loot_chance = Math.floor((Math.random() * 10) + 1);
    console.log(loot_chance);
    var loot_result = "";
    if (loot_chance >7){
      loot_result = "You obtain some copper ore.";
    }
    res.render('mines', {user: req.user, message: "Metals collide; Your skills in mining advance.", loot: loot_result});
  }
  else {
    // if the user doesn't have the necessary stamina, they take damage
    // and receieve no mining benefits.
    new_health = req.user.health - 100;
    if(new_health < 1){
      new_health = 1;
    }
    User.update({_id: req.user._id}, {$set: {health: new_health}});
    res.render('mines', {user: req.user, message: "Your impatience takes its toll.", loot: ""});
  }

  });

app.listen(3000);
