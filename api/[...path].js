module.exports = async function siteLedgerApi(req, res) {
  try {
    const { app, connectDatabase } = await import('../server/src/index.js');
    await connectDatabase();

    const requestUrl = req.url || '/';
    if (!requestUrl.split('?')[0].startsWith('/api/')) {
      req.url = `/api${requestUrl.startsWith('/') ? requestUrl : `/${requestUrl}`}`;
    }

    return app(req, res);
  } catch (error) {
    console.error('API initialization failed:', error.message);
    return res.status(503).json({ message: 'The API is temporarily unavailable.' });
  }
};
