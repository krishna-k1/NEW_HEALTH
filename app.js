const express = require("express"); // 
const bodyParser = require("body-parser");
const pg = require("pg");
const bcrypt = require("bcrypt");
const passport = require("passport");
const LocalStrategy = require("passport-local").Strategy;
const GoogleStrategy = require("passport-google-oauth2").Strategy;
const session = require("express-session");
const dotenv = require("dotenv");
const path = require("path");
const axios = require('axios');
// const FormData = require
const { spawn } = require("child_process");
const { exec } = require("child_process");

// const router = express.Router();

dotenv.config();

// const { PythonShell } = require('python-shell');

const app = express();

// app.use(express.json());

const port = process.env.PORT || 3000; // Updated for Railway

const saltRounds = 10;

// Database Configuration
const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});

db.connect()
  .then(() => console.log("Connected to PostgreSQL"))
  .catch((err) => console.error("Connection error", err.stack));

// Session Configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);

// Middleware
app.use(bodyParser.urlencoded({ extended: true })); // false
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname, "public"))); // Ensure correct path for static files

// View Engine Setup
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); // Ensure views directory is correctly set

// Passport Initialization
app.use(passport.initialize());
app.use(passport.session());

// Routes

app.get("/", (req, res) => {
  res.render("load.ejs"); // Render home page
});

app.get("/login", (req, res) => {
  const errorMessage =
    req.query.error === "already_registered"
      ? "This email is already registered. Please login."
      : null;
  res.render("login.ejs", { errorMessage }); // Render login page with error message if any
});

app.get("/register", (req, res) => {
  res.render("register.ejs"); // Render register page
});

// app.get("/views/dignose", (req, res) => {
//     res.render("dignose.ejs"); // or the appropriate rendering method
// });

app.get("/views/appointment", (req, res) => {
  res.render("appointment.ejs"); // or the appropriate rendering method
});

app.get("/views/heartDiagnose", (req, res) => {
  res.render("heartDiagnose.ejs");
})
app.get("/views/appointment", (req, res) => {
  res.render("appointment.ejs");
})
app.get("/views/profile", (req, res) => {
  res.render("profile.ejs");
})

app.get("/help", (req, res) => {
  res.render("help.ejs");
})

app.get("/bill", (req, res) => {
  res.render("bill.ejs");
})

app.get("/logout", (req, res, next) => {
  req.logout(function (err) {
    if (err) {
      return next(err); // Handle logout error
    }
    res.redirect("/"); // Redirect to home after logout
  });
});

app.get("/success", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("index.ejs"); // Render index page if authenticated
  } else {
    res.redirect("/login"); // Redirect to login if not authenticated
  }
});

// on clicking the home button on navbar
app.get("/start", (req, res) => {
  res.render("index.ejs");
})

// Authentication Routes

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/success", // Redirect to success page on login success
    failureRedirect: "/login", // Redirect to login page on failure
  })
);

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (checkResult.rows.length > 0) {
      res.redirect("/login?error=already_registered"); // Redirect if email is already registered
    } else {
      const hash = await bcrypt.hash(password, saltRounds); // Hash the password
      const result = await db.query(
        "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
        [email, hash]
      );
      const user = result.rows[0];
      req.session.userId = user.id; // Set userId in session after registration
      
      // Optionally insert a row in info if the trigger did not do it automatically
      // await db.query('INSERT INTO info (user_id) VALUES ($1) ON CONFLICT DO NOTHING', [userId]);
      
      req.login(user, (err) => {
        if (err) {
          console.error("Login error:", err); // Log login errors
          return res.redirect("/login");
        }
        req.session.userId = user.id;
        res.redirect("/success"); // Redirect to success page after registration
      });
    }
  } catch (err) {
    console.error(err); // Log any errors
    res.redirect("/register"); // Redirect to register on error
  }
});

// Route to handle profile update
app.post('/updateProfile', async (req, res) => {
  console.log(req.session.userId);
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }

  // Parse and format the date of birth (dob) from the form input
  const { name, sex, dob: dobInput, location } = req.body;
  const dob = new Date(dobInput); // Convert dobInput to a JavaScript Date object
  const userId = req.session.userId;

  try {
    const query = `
      INSERT INTO info (user_id, name, sex, dob, location) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id)
      DO UPDATE SET name = $2, sex = $3, dob = $4, location = $5
    `;
    await db.query(query, [userId, name, sex, dob, location]);

     // Fetch the updated profile data
     const result = await db.query(`
      SELECT name, sex, dob, location
      FROM info
      WHERE user_id = $1`,
      [userId]
    );

    let profile = null;
    if(result.rows.length > 0){
      profile = result.rows[0]; // Get the updated profile data
    }

    // Send the updated profile to the front end
    res.render('profile', { profile: profile || null }); // Pass the profile data to the 'profile' view
    // res.redirect('/success'); // Redirect or send a success response
  } catch (error) {
    console.error("Error updating profile:", error);
    res.status(500).send("An error occurred while updating the profile.");
  }
});

// Route to handle bill saving 
app.post('/save-bill', async (req, res) => {
  console.log(req.session.userId);
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }

  // Parse and format the date of birth (dob) from the form input
  const { hoursStayed, roomType, medication, totalAmount } = req.body;
  const userId = req.session.userId;

  try {
    // Insert billing information into "bill" table
    const query = `
      INSERT INTO bill (user_id, hours_stayed, room_type, medication, total_amount) 
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (user_id) 
      DO UPDATE SET hours_stayed = $2, room_type = $3, medication = $4, total_amount = $5
      
    `;
    await db.query(query, [userId, hoursStayed, roomType, medication, totalAmount]);

    res.status(200).send({ message: 'Billing information saved successfully!' });
    // res.render('bill.ejs'); 
    // res.redirect('/success'); // Redirect or send a success response
  } catch (error) {
    console.error("Error saving billing information:", error);
    res.status(500).send("Failed to save billing information");
  }
});


// Route to handle appointment saving 
app.post('/appointment_schedule', async (req, res) => {
  console.log(req.session.userId);
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }

  // Parse and format the date of birth (dob) from the form input
  const { date, time, room, bed, doctor, purpose } = req.body;
  const userId = req.session.userId;

  try {
    // Insert billing information into "bill" table
    const query = `
      INSERT INTO appointment (user_id, appointment_date, appointment_time, room_num, bed_num, doctor_name, purpose) 
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (user_id) 
      DO UPDATE SET appointment_date = $2, appointment_time = $3, room_num = $4, bed_num = $5, doctor_name = $6, purpose = $7
      
    `;
    await db.query(query, [userId, date, time, room, bed, doctor, purpose]);

    res.status(200).send({ message: 'Appointment information saved successfully!' });
    // res.render('bill.ejs'); 
    // res.redirect('/success'); // Redirect or send a success response
  } catch (error) {
    console.error("Error saving appointment information:", error);
    res.status(500).send("Failed to save Appointment information");
  }
});
//
// app.post('/appointment_schedule', async (req, res) => {
//   if (!req.session.userId) {
//     return res.status(401).send("Unauthorized");
//   }

//   const userId = req.session.userId;
//   const { appoint_date: appointmentDate, appoint_time: appointmentTime } = req.body;

//   try {
//     const query = `
//       INSERT INTO info (user_id, appointment_date, appointment_time) 
//       VALUES ($1, $2, $3)
//       ON CONFLICT (user_id)
//       DO UPDATE SET appointment_date = $2, appointment_time = $3
//     `;
//     await db.query(query, [userId, appointmentDate, appointmentTime]);

//     // Retrieve the updated appointment data
//     const result = await db.query(`
//       SELECT appointment_date, appointment_time
//       FROM info
//       WHERE user_id = $1`,
//       [userId]
//     );

//     // Initialize scheduledAppointment, even if no rows are returned
//     const scheduledAppointment = result.rows[0] || { appointment_date: null, appointment_time: null };


//     // Render the form view with the scheduled appointment data
//     res.render('appointment', { scheduledAppointment });
//   } catch (error) {
//     console.error("Error scheduling appointment:", error);
//     res.status(500).send("An error occurred while scheduling the appointment.");
//   }
// });


app.post("/predict", async (req, res) => {
  const { features } = req.body; // Expect an array of features
  if (!features || !Array.isArray(features)) {
    return res.status(400).send({ error: "Invalid input data" });
  }

  console.log("Features received:", features); // Log the features

  //
  console.log(req.session.userId);
  if (!req.session.userId) {
    return res.status(401).send("Unauthorized");
  }

  // Parse and format the date of birth (dob) from the form input
  
  const userId = req.session.userId;

  try {
    // Insert billing information into "bill" table
    const query = `
      INSERT INTO diagnose (user_id, symptoms) 
      VALUES ($1, $2)
      ON CONFLICT (user_id) 
      DO UPDATE SET symptoms = $2
      
    `;
    await db.query(query, [userId, features]);

    // res.status(200).send({ message: 'Billing information saved successfully!' });
    // res.render('bill.ejs'); 
    // res.redirect('/success'); // Redirect or send a success response
  } catch (error) {
    console.error("Error saving diagnose information:", error);
    // res.status(500).send("Failed to save billing information");
  }


  //
  // Spawn Python process
  const pythonProcess = spawn("python3", ["predict.py", ...features]); // ..feature? // 

  let responseSent = false; // Flag to track if the response is already send

  pythonProcess.on("error", (err) => {
    console.error("Failed to start Python process:", err);
    if(!responseSent){
      responseSent = true; // Preventing sending a second response
      res.status(500).send({ error: "Failed to start Python process" });
    }
  });

  pythonProcess.stdout.on("data", async (data) => {
    const prediction = data.toString().trim();
    console.log("Prediction from python to nodejs:",prediction);
    if(!responseSent){
      responseSent = true; // prevent sending second response
      // res.send({ prediction });
      if(prediction === "1") {
            const query = `
          INSERT INTO diagnose (user_id, predicted_disease) 
          VALUES ($1, $2)
          ON CONFLICT (user_id) 
          DO UPDATE SET predicted_disease = $2
          
        `;
        await db.query(query, [userId, prediction]);
        res.send({ prediction: 1 }); // sending 1 for heart disease detected   
      } else {
        const query = `
          INSERT INTO diagnose (user_id, predicted_disease) 
          VALUES ($1, $2)
          ON CONFLICT (user_id) 
          DO UPDATE SET predicted_disease = $2
          
        `;
        await db.query(query, [userId, prediction]);
        res.send({ prediction: 0 }); // sending 0 for no heart disease
      }
    }
  });

  pythonProcess.stderr.on("data", (error) => {
    console.error("Error:", error.toString());
    if(!responseSent){
      responseSent = true; // prevent sending a second respond
      res.status(500).send({ error: "Prediction error" });
    }
  });
});

// Test python execution on railway visit /test-python , if fail troubleshoot python installation in railway environment.
// app.get("/check-python", (req, res) => {
//   const { spawn } = require("child_process");

//   const pythonProcess = spawn("python", ["--version"]);
//   let output = "";

//   pythonProcess.stdout.on("data", (data) => {
//       output += data.toString();
//   });

//   pythonProcess.stderr.on("data", (err) => {
//       console.error(`Error: ${err}`);
//   });

//   pythonProcess.on("close", () => {
//       res.send(`Python version: ${output || "Python not found"}`);
//   });
// });


app.get("/python-path", (req, res) => {
  exec("which python3", (err, stdout, stderr) => {
      if (err) {
          console.error(`Error: ${stderr}`);
          return res.status(500).send("Python not found.");
      }
      res.send(`Python3 Path: ${stdout}`);
  });
});



// submiting and predicting disease
// app.post("/submit-symptoms", async (req, res) => {
//   try {
//       const symptomsString = req.body.symptoms;
//       const symptomsArray = symptomsString.split(',').map(s => s.trim());

//       const flaskServiceUrl = process.env.FLASK_SERVICE_URL || 'http://localhost:5000';
//       //const flaskResponse = await axios.post(`${flaskServiceUrl}/predict`, { symptoms });
//       console.log("Connecting to Flask service at:", flaskServiceUrl); // Log the URL
//       console.log(symptomsArray);

//       const response = await axios.post(`${flaskServiceUrl}/predict`, {
//           symptoms: symptomsArray
//       });
      
//       const predictedDisease = response.data.disease;
//       res.send(`<script>alert('Predicted Disease: ${predictedDisease}'); window.location.href = "/";</script>`);
//   } catch (error) {
//       console.error("Error predicting disease:", error);
//       res.status(500).send("An error occurred while predicting the disease.");
//   }
// });

// app.post("/submit-symptoms", (req, res) => {
//   const symptomsString = req.body.symptoms;
//   const symptomsArray = symptomsString.split(',').map(s => s.trim());
//   console.log(symptomsArray);

//   let options = {
//       mode: 'text',
//       pythonOptions: ['-u'], // unbuffered output
//       args: [JSON.stringify(symptomsArray)]
//   };

//   let python = require('python-shell');
//   python.PythonShell.run('predict.py', options, function (err, results) {
//       if (err) {
//           console.error("Error in Python script:", err);
//           return res.status(500).send("An error occurred while predicting the disease.");
//       }
      
//       try {
//           const prediction = JSON.parse(results[0]);
//           const predictedDisease = prediction.disease;
//           console.log(predictedDisease);
//           res.send(`<script>alert('Predicted Disease: ${predictedDisease}'); window.location.href = "/";</script>`);
//       } catch (parseError) {
//           console.error("Error parsing prediction result:", parseError);
//           res.status(500).send("An error occurred while parsing the prediction result.");
//       }
//   });
// });




// Passport Local Strategy
passport.use(
  "local",
  new LocalStrategy({ usernameField: "email", passwordField: "password", passReqToCallback: true }, // Enable req in callback
    async (username, password, done) => {
    try {
      const result = await db.query(
        "SELECT * FROM users WHERE email = $1",
        [username]
      );
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const valid = await bcrypt.compare(password, user.password); // Compare passwords
        if (valid) {
          req.session.userId = user.id;
          console.log("User ID for current session: "+user.id);
          return done(null, user); // Successful login
        } else {
          return done(null, false, { message: "Incorrect password." });
        }
      } else {
        return done(null, false, { message: "User not found." });
      }
    } catch (err) {
      return done(err);
    }
  })
);

// Passport Google Strategy
passport.use(
  "google",
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.BASE_URL}/auth/google/success`, // Updated for Railway
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const result = await db.query(
          "SELECT * FROM users WHERE email = $1",
          [profile.email]
        );
        if (result.rows.length === 0) {
          const newUser = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING *",
            [profile.email, "google"] // Dummy password for Google users
          );
          req.session.userId = user.id; // Set userId in session
          console.log("User Id for current session: "+ user.id);
          return done(null, newUser.rows[0]);
        } else {
          return done(null, result.rows[0]);
        }
      } catch (err) {
        return done(err);
      }
    }
  )
);

// Passport Serialize/Deserialize
passport.serializeUser((user, done) => {
  console.log("Serialize: user id"+ user.id);
  done(null, user.id); // Serialize user ID
});

passport.deserializeUser(async (id, done) => {
  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
    console.log("Deserialize: user id: "+ id);
    done(null, result.rows[0]); // Deserialize user from ID
  } catch (err) {
    done(err, null);
  }
});

// Google Auth Routes
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] }) // Authenticate with Google
);

app.get(
  "/auth/google/success",
  passport.authenticate("google", {
    successRedirect: "/success", // Redirect on success
    failureRedirect: "/login", // Redirect on failure
  })
);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).sendFile(path.join(__dirname, "views", "404.html")); // Serve 404 page
});

// Start Server
app.listen(port, () => {
  console.log(`Server running on port ${port}`); // Log server status
});
