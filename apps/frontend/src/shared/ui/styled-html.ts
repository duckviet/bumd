export function styledHtmlPage(title: string, badgeText: string, content: string): string {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --color-signal-orange: #ff682c;
      --color-carbon: #202020;
      --color-graphite: #4d4d4d;
      --color-slate: #828282;
      --color-fog: #f5f5f5;
      --color-mist: #efefef;
      --color-chalk: #e8e8e8;
      --color-paper: #ffffff;
      --font-inter: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
    }
    body {
      margin: 0;
      padding: 0;
      font-family: var(--font-inter);
      background-color: var(--color-mist);
      color: var(--color-carbon);
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }
    main {
      background-color: var(--color-paper);
      padding: 40px;
      border-radius: 8px;
      width: 100%;
      max-width: 400px;
      box-shadow: 0 1px 3px rgba(32, 32, 32, 0.04), 0 4px 12px rgba(32, 32, 32, 0.03);
      box-sizing: border-box;
    }
    h1 {
      font-size: 32px;
      line-height: 1.19;
      letter-spacing: -0.64px;
      margin: 0 0 24px 0;
      font-weight: 600;
    }
    form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    label {
      display: flex;
      flex-direction: column;
      gap: 6px;
      font-size: 14px;
      font-weight: 500;
      color: var(--color-graphite);
    }
    input, select {
      padding: 10px 14px;
      font-size: 15px;
      background-color: var(--color-paper);
      border: 1px solid var(--color-chalk);
      border-radius: 8px;
      color: var(--color-carbon);
      outline: none;
      transition: border-color 0.15s ease;
      font-family: var(--font-inter);
    }
    input:focus, select:focus {
      border-color: var(--color-signal-orange);
    }
    button {
      background-color: var(--color-carbon);
      color: var(--color-paper);
      border: none;
      border-radius: 20px;
      height: 40px;
      font-size: 15px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 8px;
      transition: background-color 0.15s ease;
      font-family: var(--font-inter);
    }
    button:hover {
      background-color: var(--color-graphite);
    }
    a {
      display: block;
      text-align: center;
      margin-top: 16px;
      font-size: 14px;
      color: var(--color-graphite);
      text-decoration: none;
      transition: color 0.15s ease;
    }
    a:hover {
      color: var(--color-carbon);
      text-decoration: underline;
    }
    .badge {
      display: inline-block;
      color: var(--color-signal-orange);
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 6px;
    }
    .error-msg {
      color: #d32f2f;
      font-size: 14px;
      margin-bottom: 16px;
    }
  </style>
</head>
<body>
  <main>
    <span class="badge">${badgeText}</span>
    ${content}
  </main>
</body>
</html>`;
}
