const fetch = require('node-fetch');
const path = require('path');
const fs = require('fs');
const download = require('download');
const mkdirp = require('mkdirp');
const zipFolder = require('zip-folder');


function getParentPath(path) {
    let match;

    if (/^\//.test(path)) return -1;
    match = path.match(/(\.\/)?(\.\.\/)/g);
    if (!match) return 0;

    return match.length;
}

//TODO: Переписать красиво

function joinPath(parentPath, joiningPath) {
    let count = getParentPath(joiningPath);
    let path;

    if (count === -1) {
        path = parentPath.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i)[0];
        path += joiningPath;
    }
    if (count === 0) {
        if (/\.\w+$/i.test(parentPath)) path = parentPath.slice(0, parentPath.lastIndexOf('/')) + '/' + joiningPath.replace(/^\.\//, '');
        else path = parentPath + '/' + joiningPath.replace(/^\.\//, '');
    }
    if (count > 0) {
        if (/\.\w+$/i.test(parentPath)) count = count + 1;
        path = parentPath.match(/(?:https?:\/\/)?(www\.)?(?:[^\/]+)/g);
        if (count > path.length) throw new Error('Путь не может подняться выше');
        path = path.slice(0, path.length - count);
        path = path.join('/');
        path += '/' + joiningPath.replace(/^(\.\/)?(\.\.\/)+/ig, '');
    }

    return path;
}

function isUrl(path) {
    return /^(?:https?:\/\/|\/\/)/i.test(path);
}

function isFile(path) {
    return /\.[^\/]{2,}$/.test(path);
}

function getDomainName(url) {
    let domain = url.match(/^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/\n]+)/i);
    return domain ? domain[1] : domain;
}

function isDomainsEquals(mainDomen, additionalDomain) {
    return getDomainName(mainDomen) === getDomainName(additionalDomain);
}

function filterCss(item) {
    return /\.css[^\/]*$/i.test(item);
}

function filterFiles(item) {
    return /\.(?!php)?[^\/]{2,}$/i.test(item);
}

function findAndReplaceMedia(data, url) {
    let srcRe = /\s+(?:href|src) *= *(['"]?)(\S+)\1/igm;
    let urlRe = /url\((['"]?)(?!data:)([\w.;=:,#\/\-%]+)\1\)/igm;
    let importRe = /@import\s+(['"]?)([\w.;=:,#\/\-%]+)\1/igm;
    let reArr = [srcRe, urlRe, importRe];
    let output = {
        data: data,
        files: []
    };

    reArr.forEach(re => {
        output.data = output.data.replace(re, ($1, $2, $3) => {
           if (
               (isUrl($3) && !isDomainsEquals(url, $3)) ||
               (!isFile($3)) ||
               (!/^\/(?!\/)/.test($3))
           ) return $1;
            //Добавить слайс для относительных путей
           let parsedUrl = url.match(/(?:https?:\/\/)?(www\.)?(?:[^\/]+)/ig);
           let count = parsedUrl.slice(1, parsedUrl.length - 1);
           let replaced = sliceVersionPostfix($3.replace(/^\//, ''));

           for (var i = 0; i < count.length; i++) {
               replaced = '../' + replaced;
           }

           output.files.push(replaceUrl($3, url));

           return $1.replace($3, replaced);
        });
    });

    return output;
}

function getFileName(url, origDest) {
    return sliceVersionPostfix(
        url.replace(/^(?:https?:\/\/)?(?:www\.)?[^\/]+/i, origDest)
    );
}

function getFileDest(file, origDest) {
    return path.posix.dirname(getFileName(file, origDest));
}

function replaceUrl(file, origUrl) {
    if (isUrl(file)) return file;
    return joinPath(origUrl, file);
}

function sliceVersionPostfix(path) {
    return path.replace(/[^\s\/]+\.[^\/]{2,}$/, function ($1) {
        return $1.replace(/[<>:"\/\\|?*]/g, '!')
    });
    // return path.replace(/(\.[^\/]{2,})\?[^\/]*$/, '$1');
}

function downloadTextFile(url) {
    return fetch(url)
        .then(data => data.text())
}

function downloadFiles(files, origDest) {
    return Promise.all(files.map(file => {
        downloadMedia(file, getFileDest(file, origDest)).catch(e => {

        });
    }))
}

function downloadMedia(url, dest) {
    return new Promise((resolve, reject) => {
        // let name = sliceVersionPostfix(
        //     url.slice(url.lastIndexOf('/') + 1)
        // );
        mkdirp(dest, (err) => {
            if (!err) {
                download(url, dest).then(() => {
                    resolve();
                }).catch(err => {
                    reject(err);
                })
            } else {
                reject(err);
            }
        });
    });
}

function downloadCss(url, origDest) {
    return new Promise((resolve, reject) => {
        downloadTextFile(url)
            .then(css => {
                let fileName = getFileName(url, origDest);
                let dest = getFileDest(url, origDest);

                mkdirp(dest, (err) => {
                    if(err) {
                        reject(err);
                    }
                    else {
                        let data = findAndReplaceMedia(css, url);

                        Promise.all([
                            writeFilePromise(fileName, data.data, 'utf8'),
                            downloadFiles(data.files, origDest)
                        ]);
                    }
                })
            });
    });
}

function writeFilePromise(path, data, enc) {
    return new Promise(function (resolve, reject) {
        fs.writeFile(path, data, enc, (err) => {
            if (err) reject(err);
            resolve();
        });
    });
}

//TODO: Переписать красиво

function catcher(url, origDest) {
    let filePath = path.join(origDest, 'index.html');

    downloadTextFile(url)
        .then(html => {
            mkdirp(origDest, (err) => {
                if (!err) {
                    let data = findAndReplaceMedia(html, url);
                    let css = data.files.filter(filterCss);
                    let files = data.files.filter(item => item.indexOf('.css') === -1);
                    Promise.all([
                        Promise.all(files.map(file => {
                            downloadMedia(file, getFileDest(file, origDest));
                        })),
                        Promise.all(css.map(file => {
                            downloadCss(file, origDest);
                        })),
                        writeFilePromise(filePath, data.data, 'utf8')
                    ]).then(()=> {
                        zipFolder(origDest, origDest + '.zip', (err) => {
                            if(err) {
                                console.log('oh no!', err);
                            } else {
                                console.log('EXCELLENT');
                            }
                        });
                    });
                }
            });
        })
}

module.exports = {
    isUrl,
    isFile,
    getDomainName,
    isDomainsEquals,
    getFileName,
    getFileDest,
    replaceUrl,
    sliceVersionPostfix
};

catcher('http://megagroup.ru/', 'mg');