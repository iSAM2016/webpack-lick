#! /usr/bin/env node

// 1. 找到目录下的webpack.conf.js 配合文件

let path = require('path');

//  config 配置文件
let config = require(path.resolve('webpack.config.js'));

let Compiler = require('../lib/Compiler.js');

let compiler = new Compiler(config);

// 标识运行编译
compiler.run();
