var multer = require('multer');
var cors = require('cors');
const fs = require('fs');
const https = require('https');
const path = require('path');
var express = require('express');
var mysql = require('mysql');
var stripe = require('stripe')('...');
var mailer = require('nodemailer');
var helmet = require('helmet');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const session = require('express-session');
var FormData = require('form-data');

const apikey = "Ur.#m=J7<fbD[L==C<*8q@,/KX,6gfTPp;d%";
const saltRounds = 10;

var app = express();

const sslServer = https.createServer({
  key: fs.readFileSync('/etc/letsencrypt/live/api.rsgroup.sk/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/api.rsgroup.sk/cert.pem')
}, app);

app.use(express.json());
app.use(helmet());

app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ credentials: true, origin: ['http://(verejnaIP):3000', 'https://pneumatiky.rsgroup.sk', 'https://rsgroup.sk', 'https://bg.rsgroup.sk'] }));

function getRandomString(length) {
  var randomChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var result = '';
  for (var i = 0; i < length; i++) {
    result += randomChars.charAt(Math.floor(Math.random() * randomChars.length));
  }
  return result;
}


const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'images'));
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
})


var upload = multer({
  storage: storage
});

app.use(session(
  {
    key: "userId",
    secret: "qw4654fy432!-&|cv435x432ghdsf34t3!-y&&57wf5fcsfgsd658tw85",
    resave: false,
    saveUninitialized: false,
    cookie: {
      expires: 86400000,
    }
  }
));

/**
 * LOCALHOST...
 const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'password',
  database: 'eshop'
});
 */


const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: '...',
  database: 'rsgroup',
  port: 3306
});


//Token 0 level - unregistered users
//Token 1 level - registered users
//Token 2 level - administrators.

//Set the billing info
//Requires token
app.post('/setbillinginfo', (req, res) => {
  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, async (errToken, resToken) => {
    if (resToken.length > 0) {
      let email = req.body.email;
      let telephone = req.body.telephone;
      let name = req.body.name;
      let adresa = req.body.adresa;
      let x = {
        email: email,
        telephone: telephone,
        name: name,
        adresa: adresa
      }
      if (!req.session.billing) {
        req.session.billing = x;
      }
      return res.send("OK");
    } else return res.send({ message: 'Nemožno vykonať operáciu!', status: 'error', header: 'Vyskytol sa problém!' });
  });

});

//Retrieves photo 
app.post('/receivephoto', (req, res) => {
  db.query('SELECT * FROM tokens WHERE id=1', (err, result) => {
    let photoName = req.body.photo;
    var form = new FormData();
    form.append('file', fs.readFileSync('/opt/rsgroup-API/images/'+photoName));
    res.send(form);
  });
});

app.get('/hi', (req, res) => {
  res.send('hihihi');
});

//Gets the info from the cart where you entered  the email and so on...
//Requires token.
app.get('/getbillinginfo', (req, res) => {
  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, async (errToken, resToken) => {
    if (resToken.length > 0) {
      if (req.session.billing)
        res.send(req.session.billing);
      else
        res.send('Error sending the request of personal cookies');
    } else return res.send({ message: 'Nemožno vykonať operáciu!', status: 'error', header: 'Vyskytol sa problém!' });
  });
});

app.get('/hello', (req, res) => {
  db.query(`SELECT * FROM users WHERE admintoken='${req.session.admintoken}'`, (err, result) => {
    if (err) return res.send("ERR");
    if (result.length === 0) return res.send("Nejsi autorizovanej.");
    return res.send("OK");
  });
});

//Sends the email to the owner, contacting him.
//Requires token.
app.post('/sendcontact', (req, res) => {
  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, async (errToken, resToken) => {
    if (resToken.length > 0) {
      let toEmail = req.body.toEmail;
      let meno = req.body.meno;
      let telefon = req.body.telefon;
      let sprava = req.body.sprava;

      // create reusable transporter object using the default SMTP transport
      let transporter = mailer.createTransport({
        host: 'smtp.forpsi.com',
        port: 465,
        secure: true, // use SSL
        auth: {
          user: 'postmaster@rsgroup.sk',
          pass: 'Rybicky6!'
        }
      });

      let info = await transporter.sendMail({
        from: 'postmaster@rsgroup.sk',
        to: toEmail,
        subject: `Kontaktný formulár od uživateľa ${meno}`,
        html: `
          <html>
            <body>
              <p>Uživateľ: ${meno}</p>
              <p>Telefón: ${telefon}</p>
              <p>Email: ${toEmail}</p>
              <hr/>
              <p style="white-space: pre-wrap;">${sprava}</p>
              <hr/>
              <p>Ak chcete ďalej komunkovať s týmto uživateľom, kontaktujte ho priamo na svojom maily zobrazenom vyššie!</p>
            </body>
          </html>

        `,
      });
      return res.send({ message: `Majiteľ e-shopu bol kontaktovaný!`, header: 'E-mail odoslaný!', status: 'success' });
    } else return res.send({ message: 'Nemožno vykonať operáciu, prihlás sa!', status: 'error', header: 'Vyskytol sa problém!' });
  });
})


//Creates a receipt sent to email.
//Requires token
app.post('/receiptmail', async (req, res) => {

  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, async (errToken, resToken) => {
    if (resToken.length > 0) {
      let objednavka = req.body.objednavka_id;
      let cookieCart = req.body.cookieCart;
      let email = req.body.email;
      let firstlast = req.body.firstlast;
      let telefon = req.body.telefon;
      let adresa = req.body.adresa;
      let suma = req.body.suma;
      let paidbyCard = req.body.paidbyCard;
      let orderString = ``;

      // create reusable transporter object using the default SMTP transport
      let transporter = mailer.createTransport({
        host: 'smtp.forpsi.com',
        port: 465,
        secure: true, // use SSL
        auth: {
          user: 'postmaster@rsgroup.sk',
          pass: 'Rybicky6!'
        }
      });


      for (let x = 0; x < cookieCart.length; x++) {
        orderString += `<div style="color: white;
            font-weight: bold;
            background: white;
            border-radius: 10px;
            width: 50%;
            margin-bottom: 10px;
            padding: 5px;">
              <div style="color: black;">${cookieCart[x].nazov + ` (${cookieCart[x].count}x)`}</div>
              <div style="color: black;">${cookieCart[x].count * parseFloat(cookieCart[x].cena)}€</div>
            </div>`;
      }

      // send mail with defined transport object
      let info = await transporter.sendMail({
        from: 'postmaster@rsgroup.sk', // sender address
        to: email, // list of receivers
        subject: `Objednávka dokončená ✔ [${objednavka}]`, // Subject line
        html: `
          <html>
            <body style="width: 85%; margin: 0 auto; background: #1f1f1f; padding: 30px; border-radius: 10px">
            <h1 style="color: white; text-align: center; font-size: 26px;">Objednávka úspešne dokončená!</h1>
              <p style="color: white; font-size: 20px;">Ďakujeme, že ste sa rozhodli pre náš obchod! Bol Vám vystavený bloček so všetkými produktmi, čo ste si zakúpili.</p>
              <h1 style="color: white; font-size: 20px; font-weight: bold">Zakúpené produkty: </h1>
              ${orderString}
              <p style="color: white; font-size: 20px;">Ak by sa náhodou stalo, že váš produkt je chybný a chcete ho reklamovať, použite nasledovný kód na našej web stránke v sekcií REKLAMÁCIA: <br><br>Kód objednávky: ${objednavka}</p>
              <p style="color: white; font-size: 20px;">V prípade otázok nás neváhajte kontaktovať prostredníctvom našej web stránky v sekcií KONTAKT.</p><br><br>
              <p style="color: white; font-size: 20px;">Ďakujeme, <br>rsgroup.sk</p>
            </body>
            <style>
              @media only screen and (max-width: 600px) {
                #showMobile {
                  width: 98%;
                }
              }
            </style>
          </html>

        `,
      });
            // send mail with defined transport object
            let infoMessage = await transporter.sendMail({
              from: 'postmaster@rsgroup.sk', // sender address
              to: 'postmaster@rsgroup.sk', // list of receivers
              subject: `Objednávka [${objednavka}] od ${firstlast}`, // Subject line
              html: `
                <html>
                  <body style="width: 85%; margin: 0 auto; background: #1f1f1f; padding: 30px; border-radius: 10px; color: black;">
                  <h1 style="color: black; text-align: center; font-size: 26px;">Objednávka vytvorená od ${firstlast}</h1>
                    <p style="color: black; font-size: 20px;">Ak to vyžaduje výber zákazníka, tak nasledovné položky musia byť doručené na adresu zákazníka:</p>
                    <h1 style="color: black; font-size: 20px; font-weight: bold">Zakúpené produkty: </h1>
                    ${orderString}
                    <p style="font-size: 22px">Celková suma: ${suma}€</p>
                    <p>Adresa: ${adresa}</p>
                    <p>Telefon: ${telefon}</p>
                    <p>Typ platby: ${paidbyCard === false ? `<span style="color: red">platba musí byť riadne uhradená pri prevzatí zásielky.</span>` : `<span style="color: red">platba už bola uhradená.</span>`}</p>
                    <p style="color: white; font-size: 20px;">Ďakujeme, <br>rsgroup.sk</p>
                  </body>
                  <style>
                    @media only screen and (max-width: 600px) {
                      #showMobile {
                        width: 98%;
                      }
                    }
                  </style>
                </html>
              `,
            });

      

      return res.send('Email odoslaný!');
    } else return res.send({ message: 'Nemožno vykonať operáciu!', status: 'error', header: 'Vyskytol sa problém!' });
  });

});

//Sends email about reklamácia
//Requires token and order id.
app.post('/reklamaciaemail', async (req, res) => {

    db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, async (errToken, resToken) => {
      if (resToken.length > 0) {
        let objednavkaID = req.body.objednavkaID;
        let text = req.body.text;
        
        db.query(`SELECT * FROM objednavky WHERE customer_order='${objednavkaID}'`, async(errObjd, resObjd) => {
          if(errObjd) return res.send({message: `Nemožno pokračovať ďalej z dôvodu: ${errObjd.message}`, header: 'Error', status: 'error'});
        // create reusable transporter object using the default SMTP transport
        let transporter = mailer.createTransport({
          host: 'smtp.forpsi.com',
          port: 465,
          secure: true, // use SSL
          auth: {
            user: 'postmaster@rsgroup.sk',
            pass: 'Rybicky6!'
          }
        });


        // send mail with defined transport object
        let infoFirst = await transporter.sendMail({
          from: 'postmaster@rsgroup.sk', // sender address
          to: resObjd[0].email, // list of receivers
          subject: `Reklamácia produktu [${objednavkaID}]`, // Subject line
          html: `
            <html>
              <body style="width: 85%; margin: 0 auto; background: #1f1f1f; padding: 30px; border-radius: 10px">
              <h1 style="color: white; text-align: center; font-size: 26px;">Reklamačný tiket podaný!</h1>
                <p style="color: white">Ďakujeme, že ste nás kontaktovali za účelom reklamácie produktu. Kontaktovali sme majiteľa e-shopu, ktorý sa Vám posnaží čo najskôr odpovedať.</p>
                <p>Váš text:<br>${text}</p>
                </body>
              <style>
                @media only screen and (max-width: 600px) {
                  #showMobile {
                    width: 98%;
                  }
                }
              </style>
            </html>

          `,
        });

        let info = await transporter.sendMail({
          from: resObjd[0].email, // sender address
          to: 'postmaster@rsgroup.sk', // list of receivers
          subject: `Žiadosť o reklamáciu produktu [${objednavkaID}]`, // Subject line
          html: `
            <html>
              <body style="width: 85%; margin: 0 auto; background: #1f1f1f; padding: 30px; border-radius: 10px">
              <h1 style="color: white; text-align: center; font-size: 26px;">Reklamačný tiket podaný!</h1>
                <p style="color: white">Kontaktoval Vás ${resObjd[0].meno} ohľadom žiadosti o reklamáciu produktu. Objednávka obsahuje tieto produkty: <br><br>${resObjd[0].cart} <br><br>Dôvod odvolania objednávky: ${text} <br><br>Pre viac informácií o probléme, prosím kontaktujte zákazníka buď prostredníctvom: <ul><li>emailu: <b>${resObjd[0].email}</b></li><li>telefónu: <b>${resObjd[0].telefon}</b></li></ul></p>
                </body>
              <style>
                @media only screen and (max-width: 600px) {
                  #showMobile {
                    width: 98%;
                  }
                }
              </style>
            </html>

          `,
        });

        res.send({ message: "Reklamačný tiket bol úspešne podaný. Prosím, počkajte, kým Vám odpovieme!", status: "success", header: 'Tiket podaný!' });
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu!', status: 'error', header: 'Vyskytol sa problém!' });
  });
});


//Check if product is avaiable and you can add it to cart
//Requires token
app.post('/product_available', (req, res) => {
  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, (errToken, resToken) => {
    if (resToken.length > 0) {
      let cartCookies = req.body.cartCookies;
      var problems = 0;
      db.query(`SELECT * FROM pneumatiky`, (err, result) => {
        for (let x = 0; x < cartCookies.length; x++) {
          for (let y = 0; y < result.length; y++) {
            if (cartCookies[x].id === result[y].id) {
              if (cartCookies[x].count > result[y].pocet)
                problems++;
            }
          }

          if (err) return res.send(err)

          if (problems > 0) {
            return res.send({ message: 'Počet niektorého z pridaných produktov presahuje počet produktov aktuálne skladom!', header: 'Vyskytla sa chyba!', status: 'error' });
          }
          else if (problems === 0) {
            return res.send('Košík je OK');
          }
        }
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu!', status: 'error', header: 'Vyskytol sa problém!' });
  });
});

//Selec all products according to category
//Requires no token
app.post('/produkty', (req, res) => {
  const kategoria = req.body.kategoria;
  db.query(`SELECT * FROM pneumatiky WHERE kategoria='${kategoria}' ORDER BY id DESC`, (err, result) => {
    res.send(result);
  });
});

//Search trough products according to their names...
//Requires token
app.post('/searchprodukty', (req, res) => {
  const stringText = req.body.textSnippet;
  const kategoria = req.body.kategoria;
  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, (errToken, resToken) => {
    if (resToken.length > 0) {
      db.query(`SELECT * FROM pneumatiky WHERE kategoria='${kategoria}' AND nazov LIKE '${stringText}%'`, (err, result) => {
        res.send(result);
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu!', status: 'error', header: 'Vyskytol sa problém!' });
  });
});

//Adds an administrator to admin team
//Requires token of level 2
app.post('/pridatadmina', (req, res) => {

  const meno = req.body.meno;
  const heslo = req.body.heslo;
  db.query(`SELECT * FROM users WHERE admintoken='${req.session.admintoken}'`, (errToken, resToken) => {
    if (resToken.length > 0) {
      db.query(`SELECT * FROM users WHERE username='${meno}'`, (errFirst, resultFirst) => {
        if (resultFirst.length === 0) {
          let token = getRandomString(50);
          let admintoken = getRandomString(50);
          bcrypt.hash(heslo, saltRounds, function (err, hash) {
            db.query(`INSERT INTO users(username, password, privilege, token, admintoken) VALUES('${meno}', '${hash}', '1' ,'${token}', '${admintoken}')`, (err, result) => {
              res.send({ message: `Administrátor ${meno} úspešne pridaný!`, status: "success", header: "Akcia vykonaná!" });
            });
          });
        } else res.send({ message: `Tento uživateľ s menom ${meno} už existuje!`, status: "error", header: "Vyskytla sa chyba!" });
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu!', status: 'error', header: 'Vyskytol sa problém!' });
  });
})

//Delete products
//Requires token of level 2
app.post('/deleteprodukty', (req, res) => {
  const nazov = req.body.nazov;
  db.query(`SELECT * FROM users WHERE admintoken='${req.session.admintoken}'`, (errToken, resToken) => {
    if (resToken.length > 0) {
      db.query(`DELETE FROM pneumatiky WHERE nazov='${nazov}'`, (err, result) => {
        if (!err)
          res.send({ message: `Produkt ${nazov} úspešne odstránený! Aplikované zmeny uvidíte po prehodení kategórie`, status: "success" });
        else res.send({ message: `Nebolo možné pridať produkt ${nazov}`, status: "error" })
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu!', status: 'error', header: 'Vyskytol sa problém!' });
  });
})

//Logs out of the website
//Requires token...
app.get('/logout', (req, res) => {
  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, (errToken, resToken) => {
    if (resToken.length > 0) {
      req.session.destroy((err) => {
        if (!err) {
          res.send({ message: 'Úspešne odhlásený! Počkajte chvíľu...', success: true });
        } else res.send({ message: 'Vyskytla sa chyba pri odhlasovaní!', success: false });
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu, registruj sa.', status: 'error', header: 'Vyskytol sa problém!' });
  });
});

//Getting items into the cart
//Requires Token...
app.post("/getitemavailability", (req, res) => {
  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, (errToken, resToken) => {
    if (resToken.length > 0) {
      let productName = req.body.productName;
      db.query(`SELECT * FROM pneumatiky WHERE nazov='${productName}'`, (errSelect, resSelect) => {
        if (errSelect) return res.send({ message: `Vyskytla sa chyba s pridávaním produktu do košíka!`, header: 'Chyba!', status: 'error', errorCode: errSelect.message });
        if (resSelect[0].pocet === 0) return res.send({ message: `Produkt ${productName} momentálne nemáme na sklade!`, header: 'Nedostatok tovaru!', status: 'error' });
        return res.send({ message: `Produkt ${productName} bol úspešne pridaný do košíka!`, header: 'Pridané!', status: 'success' });
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu, prihlás sa!', status: 'error', header: 'Vyskytol sa problém!' });
  });
});


//Gets the information about the product.
//No token needed
app.post('/getpneumatikainfo', (req, res) => {
  let nazov = req.body.nazov;
  db.query(`SELECT * FROM pneumatiky WHERE nazov='${nazov}'`, (err, result) => {
    res.send({
      message:
        `Značka: ${result[0].znacka} \nDezén: ${result[0].dezen} \nParametre: ${result[0].parametre} \nSegment: ${result[0].segment} \nŠírka: ${result[0].sirka} \nProfil: ${result[0].profil} \nKonštrukcia: ${result[0].konstrukcia} \nPriemer ${result[0].priemer}`, status: 'info', header: result[0].nazov
    });
  });
});

//Gets all the administrators on the website.
//Token level 2 needed.
app.get('/getalladmins', (req, res) => {
  db.query(`SELECT * FROM users WHERE admintoken='${req.session.admintoken}'`, (errToken, resToken) => {
    if(errToken) return res.send({message: errToken.message});
    if (resToken.length > 0) {
      db.query(`SELECT * FROM users WHERE privilege='1'`, (err, result) => {
        res.send(result);
      })
    } else return res.send({ message: 'Nemožno vykonať operáciu.', status: 'error', header: 'Vyskytol sa problém!' });
  });
});

//Deletes the administrator.
//Token needed.
app.post('/deleteusers', (req, res) => {
  db.query(`SELECT * FROM users WHERE admintoken='${req.session.admintoken}'`, (errToken, resToken) => {
    if (resToken.length > 0) {
      const user = req.body.username;
      db.query(`DELETE FROM users WHERE username='${user}'`, (err, result) => {
        res.send({ message: `Administrátor ${user} úspešne odstránený!`, status: "success", header: "Podarilo sa!" });
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu.', status: 'error', header: 'Vyskytol sa problém!' });
  });

});

//Sends the Stripe security key to the user front-end..
//High risk of exposing, therefore we use token authentication.
app.get('/stripe-vertification', (req, res) => {

  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, (errToken, resToken) => {
    if (errToken) return res.send({ message: errToken.message, status: 'error' });
    if (resToken.length > 0)
      return res.send("...");
    else return res.send({ message: 'Nemožno vykonať operáciu.', status: 'error', header: 'Vyskytol sa problém!' });
  });
});


//Success redirection..
//Stripe service handles this operation.
app.get('/success', async (req, res) => {
  const session = await stripe.checkout.sessions.retrieve(req.query.id);
  const customer = await stripe.customers.retrieve(session.customer);
  return res.redirect(`https://pneumatiky.rsgroup.sk/success?id=${req.query.id}`);
});

//Register users --- security: checks a token meant for 
// unregistered users to successfully register.. 
// .. payments require user to register because of unique token.
app.post('/4dIzOhXl59', (req, res) => {
  let usernameReg = req.body.user;
  let passwordReg = req.body.pass;
  let emailReg = req.body.em;

  db.query('SELECT * FROM tokens WHERE id=1', (err, result) => {
    if (err) return res.send({ message: err.message, status: 'error' });
    if (result.length !== 0) //Token exists
    {
      db.query(`SELECT * FROM users WHERE username='${usernameReg}'`, (errCheck, resultCheck) => {
        if (errCheck) return res.send({ message: err.message, status: 'error' });
        //No query error, continue...
        //If user already exists..
        if (resultCheck.length > 0) return res.send({ message: `Uživateľ s menom ${usernameReg} už existuje`, status: 'error', header: 'Vyskytla sa chyba!' });
        //Generate the token for registered user with length of 50 chars.
        let regToken = getRandomString(50);
        //Hash the password
        bcrypt.hash(passwordReg, saltRounds, function (err, hash) {
          //Insert into database..
          db.query(`INSERT INTO users (username, password, privilege, email, token) VALUES('${usernameReg}', '${hash}', '0', '${emailReg}', '${regToken}')`, (errInsert, resultInsert) => {
            if (errInsert) return res.send({ message: errInsert.message, status: 'error' });
            return res.send({ message: 'Bol si úspešne zaregistrovaný! Prosím, prihlás sa po kliknutí na tlačidlo OK.', status: 'success', header: 'Registrácia úspešná' });
          });
        });

      })
    } else return res.send({ message: 'Nemožno vykonať operáciu.', status: 'error' });
  });
});

//Check if admin token exists,
app.post('/getadmintoken', (req, res) => {
  let username = req.body.username;
  db.query(`SELECT admintoken FROM users WHERE username='${username}'`, (error, result) => {
    if (error) return res.send({ message: error.message });
    if (result[0].admintoken === null || result[0].admintoken === "") return res.send(false);
    else if (result[0].admintoken.length > 0) return res.send(true);
  });
});

//Change stock of the product
//Requires API authentication of administrator
app.post('/changestock', (req, res) => {
  db.query(`SELECT * FROM users WHERE admintoken='${req.session.admintoken}'`, (errToken, resToken) => {
    if (resToken.length > 0) {
      const stock = req.body.stock;
      const nazov = req.body.name;
      if(stock === "" || stock == "0" || parseInt(stock) < 0) return res.send({ message: `Nemôžeš nastaviť počet kusov skladom na nulu!`, status: "error", header: "Chyba!" });
      db.query(`UPDATE pneumatiky SET pocet=${parseInt(stock)} WHERE nazov='${nazov}'`, (err, result) => {
        return res.send({ message: `Počet kusov skladom pre produkt ${nazov} bol upravený!`, status: "success", header: "Podarilo sa!" });
      });
    } else return res.send({ message: 'Nemožno vykonať operáciu.', status: 'error', header: 'Vyskytol sa problém!' });
  });
})


//Registered users can login to access their data and token
//which they can communicate the API with.
//Login requires no token because of user authentication.
app.post('/login', (req, res) => {
  if (!req.session.data) {
    let userName = req.body.user;
    let passWord = req.body.pass;

    db.query('SELECT * FROM users WHERE username=?', [userName], (err, resultData) => {
        if (resultData.length > 0) {
            bcrypt.compare(passWord, resultData[0].password, function(err, result) {
              if(result === true) {
                var x = Object.assign(resultData, { isLogged: true });
                req.session.user = x;
                req.session.token = resultData[0].token;
                req.session.admintoken = resultData[0].admintoken;
                res.send({ message: "Úspešne prihlásený! Počkaj chvíľu...", success: true });
              } else return res.send({ message: "Nesprávne heslo k účtu!", success: false });
            });
        } else res.send({ message: "Uživateľ neexistuje", success: false });
    });
  } else res.send({ message: "Už si prihlásený!" });
});

//Everytime user refreshes the page, we have to get
//details if the session is still active.. if yes,
//get all the datas from database. This is needed when
//you need to access something using user's info or to check if
//user is logged in, etc...
app.post('/receivelogin', (req, res) => {
  if (req.session.user)
    res.send({ user: req.session.user, isLogged: true, token: req.session.token, admintoken: req.session.admintoken });
  else
    res.send({ isLogged: false, user: null });
})

//Checks if order already exists, if yes, returns true.
//No security token is needed here, we are not passing anything to database.
app.post('/objednavka_existuje', (req, res) => {
  let kod = req.body.kod;
  db.query('SELECT * FROM objednavky', (err, result) => {
    if (err) return res.send({ message: `Vyskytla sa chyba: ${err.message}` });
    for (let x = 0; x < result.length; x++)
      if (result[x].customer_order === kod)
        return res.send(true);
    return res.send(false);
  });
});

//We are inserting order number and sensitive information when payment has been done.
//Security token 100% required when dealing with this.
app.post('/getwebsiteorders', (req, res) => {

  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, (errToken, resToken) => {

    if (errToken) return res.send({ message: errToken.message, status: 'error' });

    if (resToken.length > 0) {
      const stripeCustomer = req.body.customerid;
      const cartFrontend = req.body.cartFrontend;
      const email = req.body.email;
      const totalSuma = req.body.totalSuma;
      const cartTotal = req.body.cartTotal;
      const meno = req.body.meno;
      const telefon = req.body.telefon;
      const adresa = req.body.adresa;

      db.query(`SELECT * FROM objednavky WHERE stripe_customer='${stripeCustomer}'`, (err, result) => {
        if (result.length === 0) {

          if (err) return res.send({ error_message: err.message });
          const orderNumber = getRandomString(20);

          db.query(`INSERT INTO objednavky (stripe_customer, customer_order, cart, cena, email, meno, telefon, adresa) VALUES('${stripeCustomer}', '${orderNumber}', '${cartFrontend}', ${totalSuma}, '${email}', '${meno}', '${telefon}', '${adresa}')`, (errAdd, resultAdd) => {

            if (errAdd) return res.send({ error_message: errAdd.message });

            db.query('SELECT * FROM pneumatiky', (errSecond, resultSecond) => {
              if (errSecond) return res.send({ error_message: errSecond.message });

              for (let x = 0; x < cartTotal.length; x++) {

                for (let y = 0; y < resultSecond.length; y++) {

                  if (cartTotal[x].id === resultSecond[y].id) {
                    let currentPocet = cartTotal[x].count;
                    db.query(`UPDATE pneumatiky SET pocet=${resultSecond[y].pocet - currentPocet} WHERE id=${resultSecond[y].id}`, (errorUpdate, resultUpdate) => {
                      if (errorUpdate) return res.send({ error_message: errorUpdate.message });
                      return res.send({ message: `Transakcia prebehla úspešne! Prosím, skontrolujte si Váš e-mail: ${email}`, status: 'success', header: 'Hotovo!', customer_order: orderNumber })
                    });

                  }
                }
              }
            })
          });
        } else return res.send({ message: 'Tento token už neexistuje', status: 'error', header: 'Vyskytol sa problém!' });
      });
    } else return res.send({ message: 'Nie ste prihlásený pre vykonanie tejto operácie! Prosím, prihláste sa.', status: 'error', header: 'Vyskytol sa problém!' })
  });
});

//Creates a payment body for registered users to successfully be redirected to payment page.
//It requires token..
app.post('/create-checkout-session', async (req, res) => {

  db.query(`SELECT * FROM users WHERE token='${req.session.token}'`, async (errToken, reqToken) => {
    if (errToken) return res.send({ message: errToken.message, status: 'error' });
    if (reqToken.length > 0) {

      let cookieCart = req.body.cartOfProducts;
      var totalproducts = "";

      for (let x = 0; x < cookieCart.length; x++)
        totalproducts += `${cookieCart[x].nazov} (${cookieCart[x].count}x), `;

      let objectPrice = req.body.celkovaSuma * 100;
      const session = await stripe.checkout.sessions.create({
        success_url: `https://pneumatiky.rsgroup.sk/success?id={CHECKOUT_SESSION_ID}`,
        cancel_url: 'https://pneumatiky.rsgroup.sk/cancel',
        payment_method_types: ['card'],
        mode: 'payment',
        line_items: [{
          name: 'Nákup pneumatík',
          currency: 'eur',
          amount: objectPrice,
          quantity: 1,
          description: totalproducts,
        }]
      });
      return res.send({ id: session.id });
    } else return res.send({ message: 'Nemožno vykonať operáciu.', status: 'error', header: 'Vyskytol sa problém!' });
  });
});

//Adds a product into the database..
//High risk of exposing, therefore we are checking if user has token and is admin..
app.post('/submitproduct', upload.single('file'), async (req, res) => {
  db.query(`SELECT * FROM users WHERE admintoken='${req.session.admintoken}'`, (errToken, resToken) => {
    if (errToken) return res.send({ message: errToken.message, status: 'error' });

    if (resToken.length > 0) {
      const nazov = req.body.nazov_produktu;
      const kategoria = req.body.kategoria;
      const suma = req.body.suma;
      const znacka = req.body.znacka;
      const dezen = req.body.dezen;
      const parametre = req.body.parametre;
      const segment = req.body.segment;
      const sirka = req.body.sirka;
      const profil = req.body.profil;
      const konstrukcia = req.body.konstrukcia;
      const priemer = req.body.priemer;
      const fotka_nazov = req.body.fotka_nazov;
      const pocet_poloziek = req.body.pocet_poloziek;


      var kategoriaUpravena = 'letne';

      if (kategoria === "Osobné letné")
        kategoriaUpravena = "letne";
      else if (kategoria === "Osobné zimné")
        kategoriaUpravena = "zimne";
      else if (kategoria === "Dodávkové C")
        kategoriaUpravena = "dodavkove";
      else if (kategoria === "Offroad")
        kategoriaUpravena = "offroad";
      else if (kategoria === null)
        kategoriaUpravena = " ";

      db.query(`SELECT * FROM pneumatiky WHERE kategoria='${kategoriaUpravena}' AND nazov='${nazov}'`, (err, resultFirst) => {
        if (err) return res.send({ message: err.message, status: 'error' });
        if (resultFirst.length === 0) {
          if (kategoria === "Osobné letné") {
            db.query("INSERT INTO pneumatiky (nazov, kategoria, suma, znacka, dezen, parametre, segment, sirka, profil, konstrukcia, priemer, fotka, pocet) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [nazov, 'letne', suma, znacka, dezen, parametre, segment, sirka, profil, konstrukcia, priemer, `${fotka_nazov}`, pocet_poloziek], (errSecond, result) => {
                console.log("done");

                if (errSecond){
                  res.send({ message: errSecond.message, status: 'error' });
                  console.log("err");
                }
                else {
                  res.send({ message: `Produkt s názvom ${nazov} bol úspešne pridaný!`, status: "success", header: "Podarilo sa!" });
                }
              });

          } else if (kategoria === "Osobné zimné") {

            db.query("INSERT INTO pneumatiky (nazov, kategoria, suma, znacka, dezen, parametre, segment, sirka, profil, konstrukcia, priemer, fotka, pocet) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [nazov, 'zimne', suma, znacka, dezen, parametre, segment, sirka, profil, konstrukcia, priemer, `${fotka_nazov}`, pocet_poloziek], (err, result) => {

                if (err)
                  return res.send({ message: 'Vyskytla sa chyba pri pridávaní produktu!', success: false });
                else {
                  return res.send({ message: `Produkt s názvom ${nazov} bol úspešne pridaný!`, status: "success", header: "Podarilo sa!" });
                }
              });

          } else if (kategoria === "Dodávkové C") {

            db.query("INSERT INTO pneumatiky (nazov, kategoria, suma, znacka, dezen, parametre, segment, sirka, profil, konstrukcia, priemer, fotka, pocet) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [nazov, 'dodavkove', suma, znacka, dezen, parametre, segment, sirka, profil, konstrukcia, priemer, `${fotka_nazov}`, pocet_poloziek], (err, result) => {

                if (err)
                  return res.send({ message: 'Vyskytla sa chyba pri pridávaní produktu!', success: false });
                else {
                  return res.send({ message: `Produkt s názvom ${nazov} bol úspešne pridaný!`, status: "success", header: "Podarilo sa!" });
                }
              });

          } else if (kategoria === "Offroad") {
            db.query("INSERT INTO pneumatiky (nazov, kategoria, suma, znacka, dezen, parametre, segment, sirka, profil, konstrukcia, priemer, fotka, pocet) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              [nazov, 'offroad', suma, znacka, dezen, parametre, segment, sirka, profil, konstrukcia, priemer, `${fotka_nazov}`, pocet_poloziek], (err, result) => {

                if (err)
                  return res.send({ message: 'Vyskytla sa chyba pri pridávaní produktu!', success: false });
                else {
                  return res.send({ message: `Produkt s názvom ${nazov} bol úspešne pridaný!`, status: "success", header: "Podarilo sa!" });
                }
              });

          }
        } else res.send({ message: `Tento produkt s názvom ${nazov} už existuje!`, status: "error", header: "Vyskytla sa chyba!" });

      }
      );
    } else return res.send({ message: 'Nemožno vykonať operáciu.', status: 'error', header: 'Vyskytol sa problém!' });
  });
});



sslServer.listen(3001, function () {
  console.log('Other apps are running on port 3001');
});
