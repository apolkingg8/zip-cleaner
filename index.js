'use strict'

var fs = require('fs')
var fse = require('fs-extra')
var Util = require('util')
var Path = require('path')
var _ = require('underscore')

const ZIP_REG = /(\.rar)|(\.part[1-999]\.rar)|(\.zip)|(\.7z)|(\.[0-9]{3}\.7z)/
const TRASH_EXT_REG = /(\.txt)|(\.htm)|(\.html)|(\.part)|(\.url)/
//const TRASH_NAME_REG = /(免費)|(試看)/
const TRASH_NAME_REG = /(\u8a66\u770b)|(\u514d\u8cbb)/

var deepFind = function(nodePath, dirPathArr, filePathArr, duplicates, nameSet) {
    let childs = fs.readdirSync(nodePath)

    childs.forEach(function(val) {
        let path = Path.join(nodePath, val)
        let name = Path.parse(path).name,
            ext = Path.parse(path).ext


        if(TRASH_NAME_REG.test(name)) {
            fse.removeSync(path)
            console.log(`remove trash file ${path}`)
            childs = _.without(childs, val)
            return null;
        }

        if(TRASH_EXT_REG.test(ext)) {
            fse.removeSync(path)
            console.log(`remove trash file ${path}`)
            childs = _.without(childs, val)
        }
    })

    if((childs.length <= 2) && (childs.indexOf("Thumbs.db") > -1)) {
        fs.unlinkSync(Path.join(nodePath, childs[childs.indexOf("Thumbs.db")]))
        console.log(`remove Thumbs.db in ${nodePath}`)
        childs = _.without(childs, "Thumbs.db")
    }

    if(childs.length === 1) {
        let lonelyGuyName = childs[0]
        let lonelyGuyPath = Path.join(nodePath, lonelyGuyName)

        if(lonelyGuyName === "Thumbs.db") {
            fs.unlinkSync(lonelyGuyPath)
            console.log(`remove Thumbs.db in ${nodePath}`)
            childs.pop()
        } else if(fs.statSync(lonelyGuyPath).isFile()) {
            let parentPath = Path.join(Path.dirname(nodePath), lonelyGuyName)
            fse.move(lonelyGuyPath, parentPath, function(err) {
                if(!err) {
                    console.log(`move lonely guy ${lonelyGuyPath} to ${parentPath}`)
                } else {
                    throw err
                }
            })
        }
    }

    if(childs.length === 0) {
        //fs.rmdirSync(nodePath)
        fse.removeSync(nodePath)
        console.log(`remove empty dir ${nodePath}`)
    } else {
        childs.forEach(function(val) {
            let path = Path.join(nodePath, val)
            let state = fs.statSync(path)
            let name = Path.parse(path).name,
                ext = Path.parse(path).ext,
                cname = name.replace(/_/g, ' ').replace(/(\.part[1-999])|(\.7z)/, '')

            //如果有同名的dir
            if(nameSet.has(name) || nameSet.has(cname)) {

                if(!nameSet.has(name) && nameSet.has(cname)) {
                    name = cname
                }

                if(duplicates[name] === undefined) {
                    duplicates[name] = []
                }

                if(!nameSet.has(nodePath)) {
                    nameSet.add(nodePath)
                    duplicates[name].push(nodePath)
                }
                nameSet.add(path)

                duplicates[name].push(path)
            } else {
                if(state.isDirectory()) {
                    nameSet.add(name)
                }
            }

            if(state.isDirectory()) {
                dirPathArr.push(path)
                deepFind(path, dirPathArr, filePathArr, duplicates, nameSet)
            }

            if(state.isFile()) {
                filePathArr.push(path)
            }
        })
    }
}


const ROOT_PATH = 'G:\\R\\__'

let errs = []
var dirPaths = [], filePaths = [], duplicates = {}, nameSet = new Set()

deepFind(ROOT_PATH, dirPaths, filePaths, duplicates, nameSet)



for(let dupKey in duplicates) {
    if(duplicates.hasOwnProperty(dupKey)) {
        let dupPaths = duplicates[dupKey]

        dupPaths.sort(function(a,b) {
            return a.length > b.length
        })

        let dupRoot = dupPaths.shift()
        let dupFiles = [], dupDirs = []

        dupPaths.forEach(function(dupPath) {
            if(fs.statSync(dupPath).isFile()) {
                dupFiles.push(dupPath)
            } else {
                dupDirs.push(dupPath)
            }
        })

        if(dupFiles.length === 1) {
            let dupPath = dupFiles[0]
            let ext = Path.parse(dupPath).ext.toLowerCase()

            if(ZIP_REG.test(ext)) {
                fs.unlinkSync(dupPath)
                console.log(`remove ${dupPath}`)
            } else {
                let newPath = Path.join(ROOT_PATH, dupKey + ext)

                if(newPath !== dupPath) {
                    fs.renameSync(dupPath, newPath)
                    console.log(`move ${dupPath} to ${newPath}`)
                    try {
                        fs.rmdirSync(dupRoot)
                        console.log(`remove ${dupRoot}`)
                    } catch (e) {
                        errs.push({
                            dupPaths: dupPaths,
                            dupPath: dupPath,
                            dupRoot: dupRoot,
                            e: e
                        })
                    }
                } else {
                    console.log(`${dupPath} seams fine, ignore it.`)
                }
            }
        } else {
            dupFiles.forEach(function(dupPath) {
                let ext = Path.parse(dupPath).ext.toLowerCase()

                if(ZIP_REG.test(ext)) {
                    fs.unlinkSync(dupPath)
                    console.log(`remove ${dupPath}`)
                } else {
                    let newPath = Path.join(dupRoot, dupKey + ext)

                    if(newPath !== dupPath) {
                        try {
                            fs.renameSync(dupPath, newPath)
                            console.log(`move ${dupPath} to ${newPath}`)
                        } catch (e) {
                            errs.push({
                                dupPaths: dupPaths,
                                dupPath: dupPath,
                                dupRoot: dupRoot,
                                e: e
                            })
                        }
                    } else {
                        console.log(`${dupPath} seams fine, ignore it.`)
                        return null;
                    }
                }
            })
        }


        dupDirs.sort(function(a, b) {
            return a.length < b.length
        })

        dupDirs.forEach(function(dupPath) {
            if(fs.statSync(dupPath).isDirectory()) {
                try {
                    fs.rmdirSync(dupPath)
                } catch(e) {
                    //console.error(e)
                    if(e.code === 'ENOTEMPTY') {
                        //todo: add special case for image dir
                        fse.move(dupPath, dupRoot, function(err) {
                            if(err) {
                                errs.push({
                                    dupPaths: dupPaths,
                                    dupPath: dupPath,
                                    dupRoot: dupRoot,
                                    e: err
                                })
                            } else {
                                console.log(`move dir ${dupPath} to ${dupRoot}`)
                                return null;
                            }
                        })
                    } else {
                        errs.push({
                            dupPaths: dupPaths,
                            dupPath: dupPath,
                            dupRoot: dupRoot,
                            e: e
                        })
                    }
                }
                console.log(`remove empty dir ${dupPath}`)
            } else {
                //console.error(`${dupPath}, WTF?`)
            }
        })


    }
}

if(errs.length > 0) {
    console.log(errs)
}

console.log(`done with ${errs.length} errors`)