var NormalizedIndex = require('normalized-index')
var FlumeLogRaf = require('flumelog-aligned-offset')
var toCompat = require('flumelog-aligned-offset/compat')
var bipf = require('bipf')
var pull = require('pull-stream')
var toPull = require('push-stream-to-pull-stream')
var fs = require('fs')
var rmrf = require('rimraf')
var path = require('path')
var minimist = require('minimist')

module.exports = function (opts, cb) {
  var filename = opts.aligned || '/tmp/test-raf/log.aligned'
  var stat = fs.statSync(filename)
  var raf = toCompat(FlumeLogRaf(filename))
  var start = Date.now()

  var indexes_path = path.join(path.dirname(filename), 'indexes')

  if(opts.clean)
    rmrf.sync(indexes_path)

  function createHas(paths) {
    var getPaths = paths.map(function (path) {
      return bipf.createSeekPath(path)
    })
    return function (b) {
      for(var i = 0; i < getPaths.length; i++)
        if(!~getPaths[i](b, 0)) return false
      return true
    }
  }

  var _since = {}

  function connect (name, index) {
    var index_path = path.join(indexes_path, name)
    try {
      var index_stat = fs.statSync(index_path)
    } catch (_) {
      //if index doesn't exist yet, we'll create it.
    }

    //if the log has been newly created, rebuild indexes
    if(index_stat && stat.ctime > index.ctime)
      rmrf.sync(index_path)

    started ++
    raf.since.once(function (_seq) {
      index.since.once(function (seq) {
        _since[name] = seq
        console.error(['reindex', name, _seq - seq, seq].join(', '))
        var c = 0
        pull(
          raf.stream({gt: seq}),
          pull.through(function () {
            c++
          }),
          index.createSink(function () {
            console.log(['ended', name, c, index.since.value].join(', '))
            finished ++
            if(started === finished) next()
          })
        )
      })
    })
  }

  var indexes = {}

  var start = Date.now(), started = 0, finished = 0
  function Index (name, paths) {
    var ni = NormalizedIndex(1, {
      paths: paths, has: createHas(paths), compare: bipf.createCompareAt(paths)
    })(raf, 'indexes/' + name)

    indexes[name] = {index: ni, name: name, paths: paths, since: ni.since}

    connect(name, ni)
  }

  //the same indexes as ssb-query...
  Index('key', [['key']])
  Index('log', [['timestamp']])
  Index('cts', [['value', 'timestamp']])
  Index('clk', [['value', 'author'], ['value', 'sequence']])
  Index('tyt', [['value', 'content', 'type'], ['timestamp']])
  Index('tya', [['value', 'content', 'type'], ['value', 'timestamp']])
  Index('rtt', [['value', 'content', 'root'], ['timestamp']])
  Index('cta', [['value', 'content', 'channel'], ['value', 'timestamp']])
  Index('aty', [['value', 'author'], ['value', 'content', 'type'], ['timestamp']])
  Index('att', [['value', 'author'], ['value', 'content', 'type'], ['value', 'timestamp']])

  if(opts.logging === false) return
  console.log(['seconds'].concat(Object.keys(indexes)).join(', '))

  function log_progress () {
    if(opts.logging === false) return
    var ts = Date.now()
    var line = [(ts - start)/1000]
    for(var k in indexes) {
      line.push(indexes[k].since.value)
    }
    console.log(line.join(', '))

  }
  var int = setInterval(log_progress, 1000)

  function next () {
    clearInterval(int)
    log_progress()
    cb && cb(null, indexes, raf)
  }

}

if(!module.partent)
  module.exports(minimist(process.argv.slice(2)))










