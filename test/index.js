const CheckLeakedCC = require('checkleakedcc').default
require('dotenv').config()
// Initialize with bot api key
// Can be found at: https://checkleaked.cc/botLinks
const api = new CheckLeakedCC(process.env.key)
const entry = 'test1234@mail.com'
const page = 1;
const type = 'email';

// Experimental Search
api.experimental(entry, type)
.then(res => console.log(res))
.catch(e=> console.error(e))

// Dehashed Search
// api.dehashed(entry, type, page)
// .then(res => console.log(res))