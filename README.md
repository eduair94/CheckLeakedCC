# CheckLeaked.cc Official NPM Package

CheckLeakedCC is a NodeJS library to interact with [checkleaked.cc](https://checkleaked.cc)

## Installation

```bash
npm i checkleakedcc --save 
```

## Requirements
Bot api key, can be found at: [https://checkleaked.cc/botLinks](https://checkleaked.cc/botLinks)

## Usage

```javascript
const CheckLeakedCC = require('checkleakedcc').default

// Initialize with bot api key
// Can be found at: https://checkleaked.cc/botLinks
const api_key = 'XXXX-XXX-XXX'
const api = new CheckLeakedCC(api_key)
const entry = 'test1234@mail.com'
const page = 1;
const type = 'email';

// Experimental Search
api.experimental(entry, type)
.then(res => console.log(res))
.catch(e=> console.error(e))

// Dehashed Search
api.dehashed(entry, type, page)
.then(res => console.log(res))
.catch(e=> console.error(e))
```

## License
[MIT](https://choosealicense.com/licenses/mit/)