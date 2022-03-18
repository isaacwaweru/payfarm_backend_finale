const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
var PORT = process.env.PORT || 4000;
require("dotenv").config();
const setTZ = require('set-tz');
setTZ('Africa/Nairobi');

// create express app
const app = express(); 

// parse requests of content-type - application/x-www-form-urlencoded
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());

// Configuring the database
const dbConfig = require("./config/database.config.js");
const mongoose = require("mongoose");

mongoose.Promise = global.Promise;

// Connecting to the database
mongoose
  .connect(dbConfig.url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Successfully connected to the database");
  })
  .catch((err) => {
    console.log("Could not connect to the database. Exiting now...", err);
    process.exit();
  });

// parse requests of content-type - application/json
app.use(bodyParser.json());

// define a system route
app.get("/", (req, res) => {
  res.json({
    message: "Server running sucessfully!",
    creator: "Isaac Waweru",
    year: "2022",
    for: "Payfarm",
  });
});

//routes
require("./app/routes/routes.js")(app);

// listen for requests
app.listen(PORT, () => {
  console.log("Server is listening on port ", PORT);
});
