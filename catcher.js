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
        else path = parentPath.replace(/\/$/, '') + '/' + joiningPath.replace(/^\.\//, '');
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

function isAbsolute(path) {
    return isUrl(path) || /^\/(?!\/)/.test(path);
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
            if (isUrl($3) && !isDomainsEquals(url, $3)) {
                return $1;
            }
            if ((!isFile($3))) {
                return $1;
            }
            if (isAbsolute($3)) {
                isUrl($3) ?
                    output.files.push($3) :
                    output.files.push(replaceUrl($3, url));
                //console.log($1);
                return $1.replace($3, getRelativePath(url, $3));
            }
            //console.log($1);
            output.files.push(replaceUrl($3, url))
            return $1;
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

    return new Promise((resolve, reject) => {
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
                                    resolve(origDest.replace('public/', '') + '.zip');
                                }
                            });
                        });
                    }
                });
            })
    })
}

function sliceAbsolute(url) {
    return url.replace(/(?:^https?:\/\/[^\/]+\/)|(?:^\/(?!\/))|(?:^\/\/[^\/]+\/)/, '');
}

function sliceFileName(path) {
    return path.replace(/[^\/]$/, '');
}

function getRelativePath(parentUrl, childUrl) {
    let slicedParentUrl = sliceAbsolute(parentUrl);
    let slicedChildUrl = sliceAbsolute(childUrl);
    let splittedParentUrl;
    let splittedChildUrl;
    let includingIndex;
    let count = 0;
    let index = 0;
    let comparator = '';
    let relPath = '';
    //Если это корень
    if (!slicedParentUrl.length) {
        return slicedChildUrl;
    }
    // Режем имена файлов и смотрим подвхождение родительского урла в дочерний.
    // Если подвхождение имеется, это значит что путь дочернего находится еще глубже относительно родительского.
    // Если подвхождение имеется, то вырезаем из дочернего пути и возвращаем значение.
    includingIndex = sliceFileName(slicedChildUrl).indexOf(sliceFileName(slicedParentUrl));
    if (includingIndex !== -1) {
        return slicedChildUrl.slice(slicedParentUrl.length + 1);
    }

    splittedParentUrl = slicedParentUrl.split('/');
    splittedChildUrl = slicedChildUrl.split('/');

    // Смотрим насколько глубоко пути совпадают
    for (let i = 0, len = splittedChildUrl.length ; i < len; i++) {
        if (comparator + splittedParentUrl[i] == comparator + splittedChildUrl[i]) {
            comparator+= splittedParentUrl[i];
        }
        else {
            count = splittedParentUrl.length - i;
            index = i;
            break;
        }
    }

    while (count > 1) {
        relPath += '../';
        --count;
    }

    return relPath + splittedChildUrl.slice(index).join('/');
}

module.exports = {
    isUrl,
    isFile,
    getDomainName,
    isDomainsEquals,
    getFileName,
    getFileDest,
    replaceUrl,
    sliceVersionPostfix,
    getRelativePath,
    sliceAbsolute,
    catcher
};
