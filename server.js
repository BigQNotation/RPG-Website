var express = require('express');
var passport = require('passport');
var Strategy = require('passport-local').Strategy;
//var db = require('./db');
var path = require('path')

const mongodb = require('mongodb').MongoClient;
const ObjectID = require('mongodb').ObjectID;
const MONGO_URL = 'mongodb://localhost:27017/rpgdb';

function getRandomInt(max) {
  return Math.floor(Math.random() * Math.floor(max));
}


// Connect to the User mongoDB
let db = null;
start_server();
  async function start_server(){
  db = await mongodb.connect(MONGO_URL);
  User =  db.collection('User');
  Location = db.collection('Location');
  Store = db.collection('Store');
};


// Cron-jobs
var schedule = require('node-schedule');

var j = schedule.scheduleJob('01 * * * * *', function(){
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


app.get('/profile/',
  require('connect-ensure-login').ensureLoggedIn(),
  async function(req, res){
    res.render('profile', {user: req.user, shown_user: req.user});
  });


app.get('/profile/:userID',
  require('connect-ensure-login').ensureLoggedIn(),
  async function(req, res){
    var showuser = await User.findOne({id: Number(req.params.userID)});
    console.log("userId: " + req.params.userID);
    //console.log("showuser.health" + showuser.health);
    res.render('profile', { user: req.user, shown_user: showuser });
  });

app.get('/inventory',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    res.render('inventory', { user: req.user });
  });

app.get('/store',
  require('connect-ensure-login').ensureLoggedIn(),
  async function(req, res){

    // create an array of items for sale and their costs
    var user = await User.findOne({_id: req.user._id});
    var items_for_sale = await Store.findOne({name: user.location.name});

    res.render('store', { user: req.user, store: items_for_sale, purchase_message: "" });
  });

app.post('/store',
  require('connect-ensure-login').ensureLoggedIn(),
  async function(req, res){

    // create an array of items for sale and their costs
    var user = await User.findOne({_id: req.user._id});
    var items_for_sale = await Store.findOne({name: user.location.name});

    var item_to_purchase = await Store.findOne({'inventory.item': req.body.purchase}, {'inventory.$': 1})

    if (user.coins >= item_to_purchase.inventory[0].cost){
      user_balance = user.coins - item_to_purchase.inventory[0].cost;
      await User.update({_id: req.user._id}, {$set: {coins: user_balance}});

      if (item_to_purchase.inventory[0].type == "pickaxe"){
        // find if user already has this pickaxe
        user_pick = await User.findOne({_id: req.user._id, 'inventory.pickaxe.all_picks.name': req.body.purchase}, {'$inventory.pickaxe.all_picks':1})
        console.log(user_pick);
        if (user_pick == null){
          await User.update({_id: req.user._id}, {$push:{'inventory.pickaxe.all_picks': {name: item_to_purchase.inventory[0].item}}} )
        }
      }

      purchase_message = "You purchase the " + req.body.purchase + ".";
    }
    else {
      purchase_message = "You lack the funds to purchase a " + req.body.purchase + ".";
    }
    console.log(req.body.purchase);

    res.render('store', { user: req.user, store: items_for_sale, purchase_message: purchase_message });
  });

app.get('/mines',
  require('connect-ensure-login').ensureLoggedIn(),
  async function(req, res){
    res.render('mines', { user: req.user, message:"You enter the mine",loot:""});
  });

app.post('/mines',
  require('connect-ensure-login').ensureLoggedIn(),
  async function(req, res) {

  // if the user has enough stamina, user mines.
  // possibly receives mined ore loot.
  if (req.user.stamina > 0){
    await User.update({_id: req.user._id}, {$inc: {stamina: -1, mining_level: 1 }});

    // Roll for mined ore loot
    var loot_chance = Math.floor((Math.random() * 10) + 1);
    if (loot_chance > 3){

      // get player location
      var user = await User.findOne({_id: req.user._id});
      var location = user.location.name;

      // get possible mined ore types for this location
      var locations_loot = await Location.findOne({name: location});

      // randomly determine mined ore loot from all possible
      var loot_index = getRandomInt(locations_loot.ore.length);
      var loot_name = locations_loot.ore[loot_index];

      // get pickaxe strength, used to compare against ore type
      // get a loot count modifier from mining level
      var equipped_pickaxe = user.inventory.pickaxe.using;
      var users_pickaxe_strength = user.inventory.pickaxe.all_picks[equipped_pickaxe].value;
      var ore_count_modifier = Math.ceil(user.mining_level / 100);
      var loot_user_message = "";

      // calculate&give ore loot to user if they pass the tests
      // copper
      if (loot_name == "copper" && (users_pickaxe_strength > 0)){
        var ore_rarity = 6;
        var looted_ore = ore_count_modifier*getRandomInt(ore_rarity) + 1;
        await User.update({_id: req.user._id}, {$inc: {"inventory.ore.copper":looted_ore} });
        loot_user_message = "Metals collide; You pocket " + looted_ore + " " +  loot_name + ".";
      }
      // tin
      else if (loot_name == "tin" && (users_pickaxe_strength > 1)){
        var ore_rarity = 6;
        var looted_ore = ore_count_modifier*getRandomInt(ore_rarity) + 1;
        await User.update({_id: req.user._id}, {$inc: {"inventory.ore.tin": looted_ore}});
        loot_user_message = "Metals collide; You pocket " + looted_ore + " " +  loot_name + ".";
      }
      // silver
      else if (loot_name == "silver" && (users_pickaxe_strength > 2)){
        var ore_rarity = 3;
        var looted_ore = ore_count_modifier*getRandomInt(ore_rarity) + 1;
        await User.update({_id: req.user._id}, {$inc: {"inventory.ore.silver": looted_ore}});
        loot_user_message = "Metals collide; You pocket " + looted_ore + " " +  loot_name + ".";
      }
      // gold
      else if (loot_name == "gold" && (users_pickaxe_strength > 2)){
        var ore_rarity = 2;
        var looted_ore = ore_count_modifier*getRandomInt(ore_rarity) + 1;
        await User.update({_id: req.user._id}, {$inc: {"inventory.ore.gold": looted_ore}});
        loot_user_message = "Metals collide; You pocket " + looted_ore + " " +  loot_name + ".";
      }
      // insufficient pickaxe strength for ore type
      else {
        loot_user_message = "Your pick hits " + loot_name + " but is too weak to break any away.";
      }
    }
    else {
      loot_user_message = "You are unable to mine anything of value.";
    }

    var user = await User.findOne({_id: req.user._id});
    res.render('mines', {user: user, message: "Your skills in mining advance.", loot: loot_user_message});
  }
  else {
    // if the user doesn't have the necessary stamina, they take damage
    // and receieve no mining benefits.
    new_health = req.user.health - 100;
    if(new_health < 1){
      new_health = 1;
    }
    await User.update({_id: req.user._id}, {$set: {health: new_health}});
    var user = await User.findOne({_id: req.user._id});
    res.render('mines', {user: user, message: "Fatigue takes over your body.", loot: ""});
  }

});

app.listen(3000);
