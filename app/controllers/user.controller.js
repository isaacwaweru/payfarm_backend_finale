const User = require("../models/user.model.js");
const Transaction = require("../models/transactions.model.js");
const sendEmail = require("../util/email.js");
const crypto = require("crypto");
const jwt = require("../util/jwt.js");
const AppError = require("../util/AppError.js");
const catchAsync = require("../util/catchAsync.js");
const bcrypt = require("bcrypt");
const request = require('request');
const bodyParser = require("body-parser");
const setTZ = require('set-tz');
setTZ('Africa/Nairobi');

//login user
exports.login = (req, res, next) => {
  User.findOne({ email: req.body.email }).then((user) => {
    if (!user) {
      return res.status(401).json({
        error: "User not found!",
      });
    }
    bcrypt
      .compare(req.body.password, user.password)
      .then((valid) => {
        if (!valid) {
          return res.status(401).json({
            error: "Incorrect details!",
          });
        }
        const token = jwt.sign({ userId: user._id });
        res.status(200).json({
          user: user,
          token: token,
        });
      })
      .catch((error) => {
        res.status(500).json({
          error,
        });
      });
  });
};

//Sign up user
exports.signup = (req, res, next) => {
  bcrypt.hash(req.body.password, 10).then((hash) => {
    const user = new User({
      fullname: req.body.fullname,
      email: req.body.email,
      phone: req.body.phone,
      password: hash,
      status: req.body.status,
      amount: 0,
      transactions: [],
    });
    user
      .save()
      .then(() => {
        try {
          const emailEncode = req.body.email;
          // Create buffer object, specifying utf8 as encoding
          const bufferObj = Buffer.from(emailEncode, "utf8");
          // Encode the Buffer as a base64 string
          const encodedEmail = bufferObj.toString("base64");
          const message = `Please activate your account. Click ${
            "https://payfarm.org" + "/activate/" + encodedEmail
          }`;
          sendEmail({
            email: req.body.email,
            subject: "Account Activation",
            message,
          });
        } catch (error) {
          console.log(error);
        }
        res.status(201).json({
          message: "Account created successfully!",
        });
      })
      .catch((error) => {
        res.status(500).json({
          error: error,
        });
      });
  });
};

//Account activation
exports.accountActivation = (req, res) => {
  // console.log(req.body);
  try {
    // The base64 encoded input string
    const emailDecode = req.body.token;
    // Create a buffer from the string
    const bufferObj = Buffer.from(emailDecode, "base64");
    // Encode the Buffer as a utf8 string
    const emailDecoded = bufferObj.toString("utf8");
    User.findOneAndUpdate(
      { email: emailDecoded },
      { $set: { status: true } },
      { new: true },
      (error, doc) => {
        res.status(200).json({
          status: "success",
          message: "Account activated!",
        });
      }
    );
  } catch (error) {
    res.status(400).json({
      status: "invalid",
      message: "Activation Failed",
    });
  }
};

//Forgot password
exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on POSTED email
  const user = await User.findOne({ email: req.body.email });
  if (!user) {
    return next(new AppError("There is no user with email address.", 404));
  }

  // 2) Generate the random reset token
  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  // 3) Send it to user's email
  const resetURL = "https://payfarm.org" + "/reset/" + resetToken;

  const message = `Forgot your password? Submit a request with your new password and passwordConfirm to: ${resetURL} \nIf you didn't forget your password, please ignore this email!`;

  try {
    await sendEmail({
      email: user.email,
      subject: "Your password reset token (valid for 10 min)",
      message,
    });

    res.status(200).json({
      status: "success",
      message: "Token sent to email!",
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(new AppError(err), 500);
  }
});

//reset password
exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on the token
  const hashedToken = crypto
    .createHash("sha256")
    .update(req.body.token)
    .digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token has not expired, and there is user, set the new password
  if (!user) {
    res.status(400).json({
      status: "invalid",
      message: "This token is invalid or has expired!!",
    });
  } else {
    bcrypt.hash(req.body.password, 10).then((hash) => {
      user.password = hash;
      user.passwordResetToken = req.body.token;
      user.passwordResetExpires = undefined;
      user.save();
      // 3) Update changedPasswordAt property for the user
      res.status(200).json({
        status: "success",
        message: "Password successfully changed!",
      });
    });
  }
});

// Retrieve and return all users from the database.
exports.findAll = (req, res) => {
  User.find()
    .then((users) => {
      res.send(users);
    })
    .catch((err) => {
      res.status(500).send({
        message: err.message || "Some error occurred while retrieving users.",
      });
    });
};

// Find a single user with a userId
exports.findOne = (req, res) => {
  User.findById(req.params.userId)
    .then((user) => {
      if (!user) {
        return res.status(404).send({
          message: "User not found with id " + req.params.userId,
        });
      }
      res.send(user);
    })
    .catch((err) => {
      if (err.kind === "ObjectId") {
        return res.status(404).send({
          message: "User not found with id " + req.params.userId,
        });
      }
      return res.status(500).send({
        message: "Error retrieving user with id " + req.params.userId,
      });
    });
};

//Top up account
exports.topUp = (req, res) => {
  const userId = req.params.id;
  const newAmount = req.body.amount;
  User.find({ _id: userId }).then(function (user) {
    const updateAmount = user[0].amount + newAmount;
    User.findOneAndUpdate(
      { _id: userId },
      { $set: { amount: updateAmount } },
      { new: true },
      (error, doc) => {
        User.findById(userId, function (err, userr) {
          if (err) {
            return console.log(err);
          }
          userr.logs.push({
            amount: newAmount,
            trans_type: "Top up",
            time: Date.now(),
          });
          userr.save(function (err, editedMembers) {
            if (err) {
              return console.log(err);
            } else {
              return res.status(201).json({
                status: "success",
                message: "Top up successful!",
              });
            }
          });
        });
      }
    );
  });
};

//Send money
exports.sendMoney = (req, res) => {
  User.findOne({ phone: req.body.phone }).then((user) => {
    if (!user) {
      return res.status(201).json({
        status: "invalid",
        message: "Receipient not found!",
      });
    }
    try {
      const userId = req.params.id;
      const phoneNumber = req.body.phone;
      const transerAmount = req.body.amount;
      User.find({ _id: userId }).then(function (user) {
        const balance = user[0].amount;
        const newAmount = user[0].amount - transerAmount;
        if (balance < transerAmount || balance === 0) {
          return res.status(201).json({
            status: "invalid",
            message: "Insuffient Amount!",
          });
        }
        User.findOneAndUpdate(
          { _id: userId },
          { $set: { amount: newAmount } },
          { new: true },
          (error, doc) => {
            User.find({ phone: phoneNumber }).then(function (userTwo) {
              const currentAmount = userTwo[0].amount;
              const updatedNewAmount = currentAmount + transerAmount;
              const currentUser = userTwo[0]._id;
              User.findOneAndUpdate(
                { _id: currentUser },
                { $set: { amount: updatedNewAmount } },
                { new: true },
                (error, doc) => {
                  //User one sent
                  User.findById(userId, function (err, userr) {
                    if (err) {
                      return console.log(err);
                    }
                    userr.logs.push({
                      amount: transerAmount,
                      trans_type: "Sent",
                      time: Date.now(),
                    });
                    userr.save(function (err, editedMembers) {
                      if (err) {
                        return console.log(err);
                      } else {
                        //User two receive
                        User.findById(currentUser, function (err, userr) {
                          if (err) {
                            return console.log(err);
                          }
                          userr.logs.push({
                            amount: transerAmount,
                            trans_type: "Received",
                            time: Date.now(),
                          });
                          userr.save(function (err, editedMembers) {
                            if (err) {
                              return console.log(err);
                            } else {
                              return res.status(201).json({
                                status: "success",
                                message: "Transaction successful!!",
                              });
                            }
                          });
                        });
                      }
                    });
                  });
                }
              );
            });
          }
        );
      });
    } catch (error) {
      res.status(201).json({
        status: "invalid!",
        message: error,
      });
    }
  });
};

//Test stk
exports.stkPush = (req, res) => {
      // access token
      let url = 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
      let auth = new Buffer.from("r18IcaGzCAD2m8iuCsHVFHCTaQMPhu7k:kZQD1tAWWdUV0A0G").toString('base64');
  
      request(
          {
              url: url,
              headers: {
                  "Authorization": "Basic " + auth
              }
          },
          (error, body) => {
              if (error) {
                  console.log(error)
              }
              else {
                // let resp =
                const token = body.body;
                const token1 = JSON.parse(token).access_token;

                //STK push starts here
                const url = "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
                auth = "Bearer " + token1
                function pad2(n) { return n < 10 ? '0' + n : n }
                var date = new Date();
                const timestamp = date.getFullYear().toString() + pad2(date.getMonth() + 1) + pad2( date.getDate()) + pad2( date.getHours() ) + pad2( date.getMinutes() ) + pad2( date.getSeconds() )
                const password = new Buffer.from('569106' + 'db071fec001b9c9164024c01d93d39e9dc3cbd1094cf74e0312476c731aa2c39' + timestamp).toString('base64')
                request(
                  {
                      url: url,
                      method: "POST",
                      headers: {
                          "Authorization": auth
                      },
                      json: {
                          "BusinessShortCode": "569106",
                          "Password": password,
                          "Timestamp": timestamp,
                          "TransactionType": "CustomerPayBillOnline",
                          "Amount": req.body.amount,
                          "PartyA": req.body.phone,
                          "PartyB": "569106",
                          "PhoneNumber": req.body.phone,
                          "CallBackURL": "https://yotemarket.co.ke/test/callback_url.php",
                          "AccountReference": "Payfarm",
                          "TransactionDesc": "Payfarm"
                      }
                  },
                  function (error, response, body) {
                      if (error) {
                          console.log(error)
                      }
                      else {
                          res.status(200).json(body)
                      }
                  }
              )
              }
          }
      )
};

//STK Callback
exports.stkCallback = (req, res) => {
  if(req.body.Body.stkCallback.ResultCode == 0){
    const data = req.body.Body.stkCallback.CallbackMetadata.Item;
    const transaction = new Transaction({
      amount: data[0].Value,
      receiptno: data[1].Value,
      transactionid: new Date(data[2].Value),
      phone: data[3].Value,
    });
    transaction
    .save()
    .then(() => {
     return res.status(200).json({
        message: "Transaction successfully!",
      });
    })
    .catch((error) => {
      res.status(500).json({
        error: error,
      });
    });
  }else {
    console.log("Transaction failed epically!")
  }
};
