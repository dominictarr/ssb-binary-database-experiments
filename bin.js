var bipf = require('bipf')

var RAF = require('flumelog-random-access-storage')

var raf = RAF(process.argv[2])

//read an offset from the raf log.

raf.get(+process.argv[3], function (err, value) {
  if(err) throw err
  console.log(bipf.decode(value, 0))
})
