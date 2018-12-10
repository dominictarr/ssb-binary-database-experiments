//var NormalizedIndex = require('normalized-index')
var FlumeLogRaf = require('flumelog-aligned-offset')
var toCompat = require('flumelog-aligned-offset/compat')
var bipf = require('bipf')
var pull = require('pull-stream')
var toPull = require('push-stream-to-pull-stream')
var fs = require('fs')
var rmrf = require('rimraf')
var path = require('path')
var minimist = require('minimist')
var crypto = require('crypto')
var varint = require('varint')

function encode (value) {
  var b = Buffer.alloc(bipf.encodingLength(value))
  bipf.encode(value, b, 0)
  return b
}

module.exports = function (opts, cb) {
  var filename = opts.aligned || '/tmp/test-raf/log.aligned'
  var stat = fs.statSync(filename)
  var raf = toCompat(FlumeLogRaf(filename))
  var ht = Buffer.alloc(1024*1024*4) //4 mb hashtable
  var start = Date.now()

  //var indexes_path = path.join(path.dirname(filename), 'indexes')

  var sizes = {}, count = 0


  var buffer = Buffer.allocUnsafe(100)
  function Index (v) {
    var name = v.key, paths = v.value
    sizes[name] = {sort: 0, seq: 0, count: 0, match: 0, avg: 0}
    var getPaths = paths.map(function (path) {
      return bipf.createSeekPath(path)
    })
    var a = new Array(paths.length*2), c = 0
    var _b = Buffer.alloc(paths.length*4)
    pull(
      raf.stream(),
      pull.drain(function (data) {
        count++
        var seq = data.seq
        sizes[name].seq = data.seq
        sizes[name].count ++
        data = data.value
        var length = 0 
        for(var i = 0; i < paths.length; i++) {
          if((c = getPaths[i](data, 0)) == -1) return
          _b.writeUInt32LE(c, i*4)
          length += bipf.getEncodedType(data, c) >> 3
          a[2*i] = c;
          _length += (a[2*i+1] = c+ length + varint.decode.bytes)
          //a[i] = c bipf.decode(data, c)

        }
        var _length = varint.encodingLength(length)
        varint.encode(buffer, _length)

        for(var i = 0; i < a.length; i += 2) {
          start = a[i]
          var end = a[i+1] //start + (bipf.getEncodedType(data, c) >> 3) + varint.decode.bytes
//          console.log(i, start, end)
          data.copy(buffer, _length, start, end)
//          var h = crypto.createHash('sha256').update(buffer).digest().readUInt32LE(0)
          var h = Buffer.from(buffer.toString('ascii', 10, 20), 'base64').readUInt32LE(0)
//          console.log(buffer.toString('utf8', 10, 20), h)
          //console.log(h)
          var slots = ht.length/4
          var i = h%slots
          var v = ht.readUInt32LE((i % slots)*4)
          while (v) {
            i++
            v = ht.readUInt32LE((i % slots)*4)
//            console.log(i,  v, slots, i % slots)
          }
//          console.log(seq, i%ht.length)
          ht.writeUInt32LE(seq, (i % slots)*4)
          _length += (end-start)
        }

        sizes[name].match ++
        //var b = encode(a)
        //sizes[name].sort += b.length
        sizes[name].sort += length
        sizes[name].avg = sizes[name].sort/sizes[name].count
        sizes[name].per = sizes[name].sort/sizes[name].match
        sizes[name].p = sizes[name].match/sizes[name].count
      }, function () {
        fs.writeFileSync('output.ht', ht)
      })
    )
  }

  var start_ts = Date.now()
  var int = setInterval(function () {
    var time = (Date.now() - start_ts)/1000
    console.log(time, count / time)
    console.log(sizes)
  }, 1000)
  int.unref()

  Index({key:'key',value: [['key']]})
//  require('./indexes.json').forEach(Index)

}

if(!module.partent)
  module.exports(minimist(process.argv.slice(2)))














