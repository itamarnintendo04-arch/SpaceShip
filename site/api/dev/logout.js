const { COOKIE, setCookie } = require('../_dev');
module.exports = (req, res) => { setCookie(res, COOKIE, '', 0); res.statusCode = 302; res.setHeader('Location', '/dev'); res.end(); };
