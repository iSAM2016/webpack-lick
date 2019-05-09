let { join, resolve, relative, dirname } = require('path');
let process = require('process');
let fs = require('fs');
let babylon = require('babylon');
let traverse = require('@babel/traverse').default;
let t = require('@babel/types');
let generator = require('@babel/generator').default;
let ejs = require('ejs');
const { SyncHook } = require('tapable');
class Compiler {
    constructor(config) {
        this.config = config;
        // 需要保存入口文件的路径
        this.entryId;
        this.entry = config.entry;
        this.modules = {}; // key模块的ID ，值是模块代码
        //  工作目录
        this.root = process.cwd();
        this.hooks = {
            entryOption: new SyncHook(),
            compile: new SyncHook(),
            afterCompile: new SyncHook(),
            run: new SyncHook(),
            emit: new SyncHook(),
            done: new SyncHook()
        };
        //  如果传递了plugin 参数
        let plugins = this.config.plugins;
        if (Array.isArray(plugins)) {
            plugins.forEach(plugin => {
                plugin.apply(this);
            });
        }
    }
    // 解析源码
    parse(source, parentPath) {
        let that = this;
        let ast = babylon.parse(source); //源码转语法树
        let dependencies = [];
        traverse(ast, {
            CallExpression(p) {
                //p path 当前路径
                if (p.node.callee.name == 'require') {
                    let node = p.node;
                    node.callee.name = '__webpack_require__'; //修改方法名
                    //得到依赖的模块名注意此模块名是相对于当前模块而言的路径，我们转成相对根目录的路径的ID
                    let moduleName = node.arguments[0].value;
                    //如果需要的话，添加.js后缀
                    moduleName += moduleName.lastIndexOf('.') > 0 ? '' : '.js';
                    //得到依赖模块的ID
                    let moduleId =
                        './' +
                        relative(that.root, join(parentPath, moduleName));
                    //把参数改了，改成依赖的模块的ID，也就是把相对于当前模块相对路径，改为相对于根目录的相对路径
                    node.arguments = [t.stringLiteral(moduleId)];
                    //把模块ID放置到当前模块的依赖列表里
                    dependencies.push(moduleId);
                }
            }
        });
        //把改后的语法树重新生成代码
        let sourcecode = generator(ast).code;
        return { sourcecode, dependencies };
    }

    //1参数是模块的绝对路径 isEntry当前模块是否是入口模块
    getSource(modulePath) {
        let rules = this.config.module.rules;
        let content = fs.readFileSync(modulePath, 'utf8');
        // 用每个规则进行处理
        for (let i = 0; i < rules.length; i++) {
            let rule = rules[i];
            let { test, use } = rule;
            let len = use.length - 1;
            if (test.test(modulePath)) {
                //  loader 获取对应的loader 函数
                function normalLoader() {
                    let loader = require(use[len--]);
                    //  递归调用loader
                    content = loader(content);
                    if (len >= 0) {
                        normalLoader();
                    }
                    console.log(content);
                }
                normalLoader();
            }
        }
        return content;
    }
    // 创建模块依赖关系
    buildModule(modulePath, isEntry) {
        let that = this;
        //  拿到模块内容
        let source = that.getSource(modulePath);
        //relative是得到相对路径
        //D:\vipcode\project\201805\usewebpack D:\vipcode\project\201805\usewebpack/src/index.js
        //path.relative(this.root, modulePath); = src/index.js
        // 模块id
        let moduleId = './' + relative(that.root, modulePath); // ./src/index.js
        if (isEntry) {
            that.entryId = moduleId;
        }
        //对模块进行编译成AST并找到它依赖的模块
        //1 参数是模块的内容 第二个参数是当前模块所在目录,是用来解析依赖的路径的
        let { sourcecode, dependencies } = that.parse(
            source,
            dirname(modulePath)
        );
        // 把性对路径中的内容对应起来
        that.modules[moduleId] = sourcecode;
        //循环当前模块的依赖，然后递归编译 dependency放着模块ID，相对根目录 的路径
        // console.log(sourcecode);
        dependencies.forEach(dependency =>
            that.buildModule(join(that.root, dependency))
        );
    }
    // 发射文件
    emitFile() {
        // 输出到指定的目录下
        let main = join(this.config.output.path, this.config.output.filename);
        let templateStr = this.getSource(join(__dirname, 'main.ejs'));
        console.log(this.entryId);

        let code = ejs.compile(templateStr)({
            entryId: this.entryId,
            modules: this.modules
        });
        this.assets = {};
        //  资源中 路径对应的代码
        this.assets[main] = code;
        fs.writeFileSync(main, this.assets[main]);
    }
    run() {
        //  执行 并且创建模块的依赖关系
        this.buildModule(resolve(this.root, this.entry), true);

        //  发射文件
        this.emitFile();
    }
}
module.exports = Compiler;
