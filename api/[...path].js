module.exports = async function siteLedgerApi(req, res) {
  try {
    const { app, connectDatabase } = await import('../server/src/index.js');
    await connectDatabase();

    const requestUrl = req.url || '/';
    const requestPath = requestUrl.split('?')[0];
    const rewrittenPath = req.query?.path;

    if (requestPath === '/api/[...path]' && rewrittenPath) {
      const apiPath = Array.isArray(rewrittenPath) ? rewrittenPath.join('/') : rewrittenPath;
      const query = requestUrl.includes('?') ? requestUrl.slice(requestUrl.indexOf('?')) : '';
      req.url = `/api/${apiPath}${query}`;
    } else if (!requestPath.startsWith('/api/')) {
      req.url = `/api${requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`}`;
    }

    return app(req, res);
  } catch (error) {
    console.error('API initialization failed:', error.message);
    return res.status(503).json({ message: 'The API is temporarily unavailable.' });
  }
};
