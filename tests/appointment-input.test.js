const {test}=require('node:test');const assert=require('node:assert/strict');const {appointmentPrice}=require('../appointment-input');
test('appointment amount accepts the displayed Brazilian currency and numeric API values',()=>{
 assert.equal(appointmentPrice('R$ 123,45',200),123.45);assert.equal(appointmentPrice('R$ 1.234,56',200),1234.56);assert.equal(appointmentPrice(99.9,200),99.9);assert.equal(appointmentPrice('0,00',200),0);assert.equal(appointmentPrice(undefined,'220.00'),220);
});
test('invalid appointment amounts cannot be saved',()=>{
 for(const value of [-1,'-1','1,2','abc',Infinity,1.123,'1.23.4','',{},true]){
 if(value==='')assert.equal(appointmentPrice(value,200),200);else assert.throws(()=>appointmentPrice(value,200),{status:400});
 }
});
