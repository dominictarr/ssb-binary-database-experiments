var fs = require('fs')
var bipf = require('bipf')

module.exports = WebAssembly.Instance(
  WebAssembly.Module(
    fs.readFileSync(require('path').join(__dirname, 'fl_aligned.wasm'))
  )
).exports

var newline = Buffer.from('\n\n')

if(!module.parent) {
  var opts = require('minimist')(process.argv.slice(2))
  module.exports.memory.grow(1)
  var buffer = Buffer.from(module.exports.memory.buffer)
  var aligned = opts.aligned || '/tmp/test-raf/log.aligned'

  var block_size = 65536
  var heap = module.exports.__heap_base
  var _start = heap+block_size
  var value_content_root = _start
  _start += bipf.encode(['value', 'content', 'root'], buffer, value_content_root)
  var root_value = _start
  _start += bipf.encode(
    Buffer.concat([
      Buffer.from([2, 1]),
      Buffer.from('2qEtYbJ/tAiFuXHYgdfou7BvERxtIF7Cdq3NmjkSF4w=', 'base64')
    ]), buffer, _start)

  var value_content_text = _start
  _start += bipf.encode(['value', 'content', 'text'], buffer, value_content_text)

  var start = Date.now()

  fs.open(aligned, 'r', function (err, fd) {
    if(err) throw err
//      console.log(process.stdout._handle.fd)
//    return
    var offset = 0, l = 0, c = 0, p = 0
    ;(function next (i) {
      fs.read(
        fd,
        buffer, heap, block_size, //buffer, start point, block size
        i*block_size, //file position
        function (err, bytes) {
          if(bytes === 0) return console.log(l, i, c, p, Date.now()-start)
          while(offset < block_size*(i+1)) {
            var char_ = module.exports.fl_aligned__get(heap, offset, block_size)
            var length = module.exports.fl_aligned__length(heap, offset, block_size)
            var ptr = module.exports.bipf__seek_path(char_, value_content_root)
            if(ptr) {
//              console.log('ptr', ptr, buffer.slice(ptr, ptr+4))
              if(module.exports.bipf__equal(ptr, root_value)) {
                var ptr2 = module.exports.bipf__seek_path(char_, value_content_text)
                p++
                l += length
//                console.log(bipf.decode(buffer, char_))
              
                var v = module.exports.bipf__get_value(ptr2)
                var len = module.exports.bipf__get_length(ptr2)

                if(true) {
                  process.stdout.write('"""')
                  process.stdout.write(buffer.slice(v, v+len))
                  process.stdout.write('"""')
                  process.stdout.write('\n\n')
                } else {
                  fs.write(
                    1,
                    buffer, v, len, null, function () {}
                  )
                  fs.write(
                    1,
                    newline, 0, newline.length, null, function () {}
                  )
                }
              }
            }
            c++
            offset = module.exports.fl_aligned__next(module.exports.__heap_base, offset, block_size)
          }
          next(i+1)
        })

    })(0)

  })
}




