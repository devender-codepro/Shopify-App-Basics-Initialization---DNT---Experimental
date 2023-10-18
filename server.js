const express = require('express');
const request = require('request');
const queryString = require('querystring');
const crypto = require('crypto');
const dotenv = require('dotenv'); // Require the dotenv library

dotenv.config(); // Load environment variables from .env
const app = express();
const port = 3000;

// Store the state value securely for later verification
let storedState;
let accessToken; // Store the access token

// Function to generate a random state value
function generateRandomState() {
  return crypto.randomBytes(16).toString('hex');
}

// Step 2: The Permission Redirect
function generatePermissionUrl(clientId, redirectUri, scope) {
  const shopUrl = `https://${process.env.SHOP_URL}`;
  const authPath = '/admin/oauth/authorize';
  const state = generateRandomState(); // Generate a random state value
  storedState = state; // Store the state value securely
  const queryParams = queryString.stringify({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scope,
    state: state, // Include the random state value
  });
  const permissionUrl = `${shopUrl}${authPath}?${queryParams}`;
  return { permissionUrl, state };

//   // https://mystore.myshopify.com/admin/oauth/authorize?client_id=fe0710b263922ec2a5
// ec206dbd8cf7ac&redirect_uri=https%3A%2F%2Fmyapp.com%2Fauth%2Fshopify%2Fcallback&
// response_type=code&scope=write_script_tags%2Cwrite_themes&state=24abdb4a773b68d5
// 9d0e6b95355b4eceb2d9af80e12209fb
}

app.get('/install', (req, res) => {
  const clientId = process.env.CLIENT_ID;
  const redirectUri = 'http://localhost:3000/auth/shopify/callback';
  const scope = 'write_script_tags write_themes';

  const { permissionUrl, state } = generatePermissionUrl(clientId, redirectUri, scope);

  res.redirect(permissionUrl);
});

// Step 3: The Authorization Page
// Shopify handles this step - the user clicks "Install App" on the Shopify authorization page.

// Step 4: The Finalization
app.get('/auth/shopify/callback', (req, res) => {
  const code = req.query.code;
  const hmac = req.query.hmac;
  const state = req.query.state;
  const shop = req.query.shop;

  // Verify that the state value matches the one you generated and stored
  if (state !== storedState) {
    return res.status(403).send('State mismatch. Potential CSRF attack.');
  }

  // Exchange the authorization code for an access token.
  const accessTokenRequest = {
    uri: `https://${shop}/admin/oauth/access_token`,
    method: 'POST',
    form: {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code: code,
    },
    json: true,
  };

  request(accessTokenRequest, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      accessToken = body.access_token;

      // Step 5: The Store & Call - Store the access token securely and use it to make Shopify API requests.
      console.log(`Access Token: ${accessToken}`);
    } else {
      console.error('Error getting access token:', error);
    }
  });
});

app.get('/', (req, res) => {
  const shop =  process.env.SHOP_URL; // Replace with your Shopify store name

  if (!accessToken) {
    return res.status(403).send('Access token not available.');
  }

  const graphqlEndpoint = `https://${shop}/admin/api/2021-10/graphql.json`; // Update the API version if needed
  const graphqlQuery = `
  mutation {
    productUpdate(input: {id: "gid://shopify/Product/8141623329016", title: "TEST NAME 2025"}) {
      product {
        id
      }
    }
  }
  
  
  `;

  const graphqlRequest = {
    uri: graphqlEndpoint,
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: graphqlQuery }),
  };

  request(graphqlRequest, (error, response, body) => {
    if (!error && response.statusCode === 200) {
      const responseData = JSON.parse(body);
      console.log('GraphQL Response:', responseData.data);
      res.send('Data from Shopify: ' + JSON.stringify(responseData.data)); // Send the data to the client
    } else {
      console.error('Error making GraphQL request:', error);
      res.status(500).send('Error fetching data from Shopify');
    }
  });
});

app.listen(port, () => {
  console.log(`Your app is listening on port ${port}`);
});
