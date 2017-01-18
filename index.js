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

function findSources(data, url) {
    let srcRe = /\s+(?:href|src) *= *(['"]?)(\S+)\1/igm;
    let urlRe = /url\((['"]?)(?!data:)([\w.;=:,#\/\-%]+)\1\)/igm;
    let importRe = /@import\s+(['"]?)([\w.;=:,#\/\-%]+)\1/igm;
    let reArr = [srcRe, urlRe, importRe];
    let result;
    let sources = [];

    reArr.forEach(re => {
        while (result = re.exec(data)) {
            let source;

            if (isUrl(result[2]) && !isDomainsEquals(url, result[2])) continue;
            if (!isFile(result[2])) continue;
            source = sliceVersionPostfix(replaceUrl(result[2], url));
            if (sources.indexOf(source) == -1) sources.push(source);
        }
    });

    return sources;
}

function filterCss(item) {
    return /\.css[^\/]*$/i.test(item);
}

function filterFiles(item) {
    return /\.(?!php)?[^\/]{2,}$/i.test(item);
}

/*
* Меняем абсолютные пути файлов на относительные
* */
//TODO: Refactor - переписать красиво

function replaceMedia(data, url) {

    data = data.replace(/\s+(href|src) *= *(['"]?)(\S+)\2/igm, function (a, b, c, d) {
        let res;
        if (isUrl(c) && isDomainsEquals(url, c)) {
            res = a.replace(/(?:https?:\/\/)?(?:www\.)?[^\/]+\//i, '');
        } else if (/^\/(?!\/)/.test(d)) {
            res = a.replace('/', '');
            res = res.replace(/js\?[^"']+/, 'js');
            res = res.replace(/css\?[^"']+/, 'css');
        } else {
            res = a;
        }
        return res;
    });
    data = data.replace(/url\((['"]?)(?!data:)([\w.;=:,#\/\-%]+)\1\)/igm, function (a, b, c, d) {
        let res;
        if (isUrl(c) && isDomainsEquals(url, c)) {
            res = a.replace(/(?:https?:\/\/)?(?:www\.)?[^\/]+\//i, '');
        } else if (/^\/(?!\/)/.test(c)) {
            res = a.replace('/', '');
        } else {
            res = a;
        }
        return res;
    });
    return data;
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
    return path.replace(/(\.[^\/]{2,})\?[^\/]*$/, '$1');
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
        mkdirp(dest, function (err) {
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

//TODO: Переписать красиво

function replaceUrlsToRelative(css, url) {
    return css.replace(/url\((['"]?)(?!data:)([\w.;=:,#\/\-%]+)\1\)/igm, function ($1, $2, $3) {
        let bubbling = '';

        if (isUrl($3) && !isDomainsEquals(url, $3)) return $3;
        else if (/^\/(?!\/)/.test($3)) {
            //Абсолютный путь
            let parsedUrl = url.match(/(?:https?:\/\/)?(www\.)?(?:[^\/]+)/ig);
            let count = parsedUrl.slice(1, parsedUrl.length - 1);
            $3 = $3.replace(/^\//, '');
            for (var i = 0; i < count.length; i++) {
                bubbling += '../';
            }
        }

        return 'url(' + bubbling + $3 + ')';
    });
}

function downloadCss(url, origDest) {
    return new Promise((resolve, reject) => {
        downloadTextFile(url)
            .then(css => {
                let fileName = getFileName(url, origDest);
                let dest = getFileDest(url, origDest);
                mkdirp(dest, function (err) {
                    if(err) {
                        reject(err);
                    }
                    else {
                        fs.writeFile(fileName, replaceUrlsToRelative(css, url), err => {
                            if (err) {
                                reject(err);
                            } else {
                                let sources = findSources(css, url);
                                //console.log(sources);
                                downloadFiles(sources, origDest)
                                    .then(() => { resolve() })
                                    .catch(e => { resolve() });
                            }
                        })
                    }
                })
            })
    });
}

//TODO: Переписать красиво

function catcher(url, origDest) {
    let filePath = path.join(origDest, 'index.html');

    downloadTextFile(url)
        .then(html => {
            mkdirp(origDest, function (err) {
                if (!err) {
                    fs.writeFile(filePath, replaceMedia(html, url), 'utf8'); //async op
                    let sources = findSources(html, url);
                    let css = sources.filter(filterCss);
                    let files = sources.filter(item => item.indexOf('.css') === -1);
                    Promise.all([Promise.all(files.map(file => {
                        downloadMedia(file, getFileDest(file, origDest));
                    })), Promise.all(css.map(file => {
                        downloadCss(file, origDest);
                    }))]).then(()=> {
                        zipFolder(origDest, origDest + '.zip', function(err) {
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

catcher('http://seasonkrasoty.ru/', 'sz');