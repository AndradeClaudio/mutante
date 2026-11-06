// Orders of $50 or more ship free; below that, shipping costs $5.
function shippingFee(orderTotal) {
  return orderTotal >= 50 ? 0 : 5;
}
