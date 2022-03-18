const mongoose = require("mongoose");
const crypto = require('crypto');
const uniqueValidator = require("mongoose-unique-validator");
const UserSchema = mongoose.Schema(
  {
    fullname: { type: String },
    email: { type: String, required: true, unique: true },
    phone: { type: String },
    password: { type: String },
    status: { type: Boolean },
    amount: { type: Number },
    transactions: [],
    passwordChangedAt: Date,
    passwordResetToken:  { type: String },
    passwordResetExpires: Date,
  },
  {
    timestamps: true,
  }
);

//reset password
UserSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // console.log({ resetToken }, this.passwordResetToken);

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

UserSchema.plugin(uniqueValidator);
module.exports = mongoose.model("User", UserSchema);