const mongoose = require("mongoose");
const uniqueValidator = require("mongoose-unique-validator");
const transactionSchema = mongoose.Schema(
  {
    amount: { type: String },
    receiptno: { type: String },
    transactionid: { type: String },
    phone: { type: String },
  },
  {
    timestamps: true,
  }
);

transactionSchema.plugin(uniqueValidator);
module.exports = mongoose.model("Transactions", transactionSchema);