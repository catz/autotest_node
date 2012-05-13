var pathResolver = require('path')
var NODES_PATH = pathResolver.resolve(__dirname + '/../nodes');

exports.NODES_PATH = NODES_PATH;

exports.removeRoot = function(path) {
  return pathResolver.resolve(path).replace(NODES_PATH + '/', '')
}