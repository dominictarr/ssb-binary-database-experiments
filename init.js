
var FlumeLogOffset = require('flumelog-offset')
var FlumeLogAligned = require('flumelog-aligned-offset')
var codec = require('flumecodec')
var fs = require('fs')
var mkdirp = require('mkdirp')
var bipf = require('bipf')
var path = require('path')
var pull = require('pull-stream')
var minimist = require('minimist')

module.exports = function (opts, cb) {
  var source = opts.offset || path.join(process.env.HOME, '.ssb/flume/log.offset')
  var dest = opts.aligned || '/tmp/test-raf/log.aligned'
  try { fs.stat(source) } catch(err) {
    console.error('source log.offset file does not exist')
    throw err
  }

  //rmr.syncf(path.dirname(dest))
  mkdirp.sync(path.dirname(dest))
  try { fs.unlinkSync(dest) } catch(_) {} //delete the file if it's already there

  var block = 1024*64 //64k blocks
  var MB = 1024*1024
  var log = FlumeLogOffset(source, {blockSize: block, codec: codec.json})
  var log2 = FlumeLogAligned (dest, {block: block})

  console.log('records, mb, seconds')
  function log_progress () {
    console.log([c, length/MB, (Date.now() - start)/1000].join(', '))
  }

  function progress() {
    if(Date.now() > ts + 1000) {
      log_progress()
      ts = Date.now()
    }
  }

  var start = Date.now(), c = 0, length = 0, ts = Date.now()
  pull(
    log.stream({seqs:false}),
    pull.map(function (data) {
      var len = bipf.encodingLength(data)
      var b = Buffer.alloc(len)
      length += b.length + 4
      bipf.encode(data, b, 0)
      return b
    }),
    function (read) {
      read(null, function next (err, data) {
        c ++
        progress()
        if(err) return done(err === true ? null : err)
        log2.append(data, function () {})
        if(log2.appendState.offset > log2.appendState.written + block*10)
          log2.onDrain(function () {
            read(null, next)
          })
        else
          read(null, next)
      })
    }
  )

  function done (err) {
    if(err) throw err
    log_progress()
    cb && cb(null, true)
  }
}

if(!module.parent)
  module.exports(minimist(process.argv.slice(2)))

