const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const { CookieJar } = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const url = require('url');

const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const outputFileName = 'emails.csv';

// Function to write email and URL to CSV
function writeEmailToCsv(email, pageUrl) {
  const line = `${pageUrl};${email}\n`;
  fs.appendFileSync(outputFileName, line, 'utf8');
}

async function crawlUrl(startUrl, visited = new Set(), emails = new Set()) {
  const jar = new CookieJar();
  const client = wrapper(axios.create({ jar }));

  try {
    const { data, headers } = await client.get(startUrl);
    const $ = cheerio.load(data);

    console.log(`Visiting: ${startUrl}`);

    // Extract emails from the current page
    const pageEmails = new Set(data.match(emailRegex) || []);
    if (pageEmails.size > 0) {
      console.log(`Emails found:`, Array.from(pageEmails).join(', '));
      pageEmails.forEach(email => {
        if (!emails.has(email)) {
          emails.add(email);
          writeEmailToCsv(email, startUrl);
        }
      });
    }

    // Extract and follow links
    const baseUrl = headers['content-location'] || startUrl;
    const baseDomain = new URL(baseUrl).origin;

    const links = $('a[href]')
      .map((_, el) => $(el).attr('href'))
      .get()
      .map(link => url.resolve(baseUrl, link))
      .filter(link => {
        const parsedLink = new URL(link);
        return parsedLink.origin === baseDomain && !parsedLink.hash;
      });

    for (const link of links) {
      if (!visited.has(link)) {
        visited.add(link);
        await crawlUrl(link, visited, emails);
      }
    }
  } catch (err) {
    console.error(`Error fetching ${startUrl}:`, err.message);
  }

  return emails;
}

async function main() {
  const urls = fs.readFileSync('urls.txt', 'utf8').split('\n').map(line => line.trim()).filter(Boolean);

  // Write CSV header
  fs.writeFileSync(outputFileName, 'URL;Email\n', 'utf8');

  for (const startUrl of urls) {
    console.log(`--------------------------------`);
    console.log(`Starting crawl for ${startUrl}`);
    const emails = await crawlUrl(startUrl);
    console.log(`Total emails found for ${startUrl} (${emails.size}):`, Array.from(emails).join(', '));
  }
}

main().catch(err => console.error(err));
