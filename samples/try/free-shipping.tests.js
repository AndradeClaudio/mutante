assert(shippingFee(50) === 0);
assert(shippingFee(49.99) === 5);
assert(shippingFee(120) === 0);
assert(shippingFee(0) === 5);
