import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from 'bcrypt';

const app = express();
const port = process.env.PORT || 3000;

//Here the connection to the Database is established
const db = new pg.Pool({
  user: 'neondb_owner',
  host: 'ep-weathered-bar-abjavzid-pooler.eu-west-2.aws.neon.tech',
  database: 'neondb',
  password: 'npg_GaBDo8RqXf4y',
  port: 5432,
  ssl: {
    rejectUnauthorized: false,
  },
})

db.on('error', (err, client) => {
  console.error('Unexpected error on idle client', err);
});

//These are all the navbar links
const pages = ["Home", "Add", "Login"];
const adminPages = ["Home", "Admin", "Logs"];
const categories = ["action" ,"adventure" ,"comedy" ,"crime" ,"documentary" ,"drama" ,"family" ,"fantasy" ,"horror" ,"musical" ,"mystery" ,"romance" ,"sc-fi" ,"thriller" ,"war" ,"western"];

//This array holds all the found movies when a random selection of movies is found.
let movies = [];

//Here the server is directed over to the styling sheets and images and body parser is established.
app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));


/**
 * @description - This Function takes a found movie, looks into the Database to find the letter section the first letter of the movie is in,
 * ,finds the index of the Movie in that Section adds one to it and then returns this number to be used for displaying or logging.
 * @param {object} movieData - Found Movie. 
 * @returns {number} - This is the Number of the Movie in its section.
 */
async function getNumber(movieData){
    //Here the searchMovieName is stored in a variable with ' spaces and ? taken out and converted into lowercase for use in searching 
    //the Database.
    const searchMovieName = movieData.name.toLowerCase().replace("'", "").replace("?", "");
    //Here the Database is searched using the first letter of the movie and the location of the movie to get an Array of all the movies
    //in the same letter section as the provided Movie.
    const response = await db.query(`
        SELECT * FROM movies WHERE LOWER (letter) 
        = $1 AND location = $2 ORDER BY REGEXP_REPLACE(LOWER(name), '[''? ]', '', 'g') ASC;`, 
        [searchMovieName.charAt(0), movieData.location]
    );
    //This Line gets the index of the Movie in the Array of Movies in its Letter section.
    const movieIndex = response.rows.findIndex(row => row.name.toLowerCase().replace("'", "").replace("?", "") === searchMovieName);
    //One is added to the found index as Arrays start at 0 however the Movie Numbers start at 1.
    return movieIndex+1;
} 

/**
 * @description - This Function takes a given Movie and Database type and saves a log to the change logs database.
 * @param {object} movieData - This is the Movie Data of the Movie that is being logged.
 * @param {string} type - This is the type of the Database change that is being logged. For example, Add or Update
 */
async function changeLogs(movieData, type){
    //This section gets the current date and time without anything after the date.
    const date = String(new Date());
    const trimmedDate = date.split(' GMT')[0];
    //This section inserts a new row into the change_logs table with all the movie data, the date/ time and the type of Database change.
    await db.query("INSERT INTO change_logs (name, location, letter, category, main_actors_actresses, watch_time, date, type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [
        movieData.name, 
        movieData.location, 
        movieData.name.charAt(0).toUpperCase(), 
        movieData.category, 
        movieData.main_actors_actresses,
        Number(movieData.watch_time),
        trimmedDate,
        type
    ]);
}

/**
 * @description - This Function takes a given selection of Movies picks out 10 Random Movies (or however many are avaliable if 10 arent 
 * avaliable). The Array is then sorted Alphabetically and returned.
 * @param {object} response - A Selection of Movies to be random picked from to generate the Array.
 * @returns {Array} An array of 10 Random Movies or if less than 10 Movies are avaliable, this returns however many Movies are avaliable.
 */
async function randomMovies(response) {
    //Here the Movies that the function will search through are stored.
    const data = response.rows;
    let randomMovies = [];
    //This For Loop iterates 10 times. Each time it picks a random index in the Array and removes it from the Array. Then it gets its 
    //number from the getNumber function adds that to teh current movie data and stores this movie object in an Array called randomMovies.
    const count = Math.min(11, data.length);
    for(let x = 0; x < count; x++){
        let randomIndex = Math.floor(Math.random()*data.length);
        let randomMovie = data.splice(randomIndex,1)[0];
        randomMovie.number = await getNumber(randomMovie);
        randomMovies.push(randomMovie);
    }
    
    //This Section orders the Array of Random Movies in Alphabetical order.
    randomMovies.sort((a, b) => {
        const titleA = a.name.toLowerCase();
        const titleB = b.name.toLowerCase();
        if (titleA < titleB) return -1;
        if (titleA > titleB) return 1;
        return 0;
    });
    //This returns the Alphabetically ordered Array of random Movies.
    return randomMovies;
}

/**
 * @description This Function takes a string containing every search param the user entered. Each param is seperated out and stored in 
 * an individual property to be used to filter for random Movies.
 * @param {string} param - This is a full search param to be searched through for specific seperate params.
 * @returns {object} - Returns an object consisting of every found param.
 */
function retrieveParams(param){
    let returnParams = {};

    //Find Category - Here the index of the word that matches a catagory in the catagories list then removes it from the param Array and
    //stores it in the return params under catagory. If no word is included in the catagories Array then no category is saved in returnParams.
    const categoryIndex = param.findIndex(word => categories.includes(word.toLowerCase()));
    const category = categoryIndex !== -1 ? param.splice(categoryIndex, 1)[0] : "";
    if(category != ""){returnParams["category"] = category};

    //Find Time - Here the index of the word that is a number is found. This word is then removed from the Array and stored in returnParams
    //as the length of time for a film. If no word is a number then no time is saved.
    const timeIndex = param.findIndex(word => !isNaN(word));
    const time = timeIndex !== -1 ? param.splice(timeIndex, 1)[0] : "";
    if(time != ""){returnParams["watch_time"] = time};

    //Find Actor/Actresses - Here any other words that havent been removed from the Array and joined together with a space inbetween as a
    //string and then stored in returnParams as main_actors_actresses. If no other words remain then no actors/actress is saved.
    const actorActresses = param.join(" ");
    if(actorActresses != ""){returnParams["main_actors_actresses"] = actorActresses};

    //Here returnParams is returned to be used to search through the movie Database to find specific random films.
    return returnParams
}

//User
app.get("/", async(req, res) => {
    const response = await db.query("SELECT * FROM movies");
    movies = await randomMovies(response);
    res.render("index.ejs", {pages:pages, currentPage:"Home", movies:movies});
})

app.post("/search", async (req, res) => {
    const requestedMovie = req.body.param.toLowerCase();
    if(requestedMovie === ""){
        if(page === "index-page"){
            res.render("index.ejs", {errorResponse: "Movie not found", pages:pages, currentPage:"Home", movies:movies});
            return;
        }
        else if(page === "admin-page"){
            res.render("admin_page.ejs", {errorResponse: "Movie not found", pages:pages, currentPage:"Home", movies:movies});
            return
        }
    }
    const response = await db.query(
        `SELECT * FROM movies
        WHERE REGEXP_REPLACE(LOWER(name), '[''? ]', '', 'g') LIKE '%' || REGEXP_REPLACE(LOWER($1), '[''? ]', '', 'g') || '%'
        ORDER BY REGEXP_REPLACE(LOWER(name), '[''? ]', '', 'g') ASC;`, [requestedMovie.toLowerCase()]
    );
    if (response.rows.length === 0){
        res.render("index.ejs", {errorResponse: "Movie not found", pages:pages, currentPage:"Home", movies:movies});
        return;  
    }else{
        let movieData = response.rows;
        let movies = [];
        for(const movie of movieData){
            movie.number = await getNumber(movie);
            movies.push(movie);
        }   
            res.render("index.ejs", {movies:movies, pages:pages, currentPage:"Home"});
    }
})

app.post("/random", async (req, res) => {
    const randomParams = retrieveParams(req.body.param.toLowerCase().split(" "));
    const paramLength = Object.keys(randomParams).length;
    let response = '';
    if(paramLength === 0){
        response = await db.query("SELECT * FROM movies");

    }else if(paramLength === 1){
        const searchParam = Object.keys(randomParams)[0];
        if (searchParam === "watch_time"){
            response = await db.query(`
                SELECT * FROM movies WHERE ${searchParam} <= $1
                ORDER BY REGEXP_REPLACE(LOWER(name), '[''? ]', '', 'g') ASC;
            `, [Number(randomParams[searchParam])]);
        }else{
            response = await db.query(`
                SELECT * FROM movies WHERE LOWER(${searchParam}) LIKE '%' || $1 || '%'
                ORDER BY REGEXP_REPLACE(LOWER(name), '[''? ]', '', 'g') ASC;
            `, [randomParams[searchParam]]);
        }

    }else if(paramLength === 2){
        const searchParams = Object.keys(randomParams);
        if(searchParams.includes("watch_time")){
            const time = randomParams["watch_time"];
            delete randomParams.watch_time;
            const newSearchParams = Object.keys(randomParams);
            response = await db.query(`
                SELECT * FROM movies WHERE watch_time <= $1
                AND LOWER(${newSearchParams[0]}) LIKE '%' || $2 || '%'
                ORDER BY REGEXP_REPLACE(LOWER(name), '[''? ]', '', 'g') ASC;
            `, [Number(time), randomParams[newSearchParams[0]]])

        }else{
            response = await db.query(`
                SELECT * FROM movies WHERE LOWER(${searchParams[0]}) LIKE '%' || $1 || '%'
                AND LOWER(${searchParams[1]}) LIKE '%' || $2 || '%'
                ORDER BY REGEXP_REPLACE(LOWER(name), '[''? ]', '', 'g') ASC;
            `, [randomParams[searchParams[0]], randomParams[searchParams[1]]]);
        }
    
    }else if(paramLength === 3){
        const searchParams = Object.keys(randomParams);
        response = await db.query(`
            SELECT * FROM movies WHERE LOWER(${searchParams[0]}) LIKE '%' || $1 || '%'
            AND ${searchParams[1]} <= $2
            AND LOWER(${searchParams[2]}) LIKE '%' || $3 || '%'
            ORDER BY REGEXP_REPLACE(LOWER(name), '[''? ]', '', 'g') ASC;
        `, [randomParams[searchParams[0]], Number(randomParams[searchParams[1]]), randomParams[searchParams[2]]])
    }

    movies = await randomMovies(response);
    res.render("index.ejs", {pages:pages, currentPage:"Home", movies:movies});
})

app.get("/add", (req, res) => {
    res.render("adding_page.ejs", {pages:pages, currentPage:"Add"});
})

app.post("/add", async (req, res) => {
    let movieData = req.body;
    movieData.letter = movieData.name.charAt(0).toUpperCase();
    try{
        await db.query("INSERT INTO movies (name, location, letter, category, main_actors_actresses, watch_time) VALUES ($1, $2, $3, $4, $5, $6)", [
            movieData.name, movieData.location, movieData.letter, movieData.category, movieData.main_actors_actresses, Number(movieData.watch_time)
        ]);
        await changeLogs(movieData, "Add");
        res.render("adding_page.ejs", {pages:pages, currentPage:"Add", response: "Success"})
    }catch(err){
        console.log(err);
        res.render("adding_page.ejs", {pages:pages, currentPage:"Add", response: "Failed, Movie already exists"})
    }
})

//Admin
app.get("/login", (req, res) => {
    res.render("login_page.ejs", {pages:pages, currentPage:"Login"});
})

app.post("/login", async (req, res) => {
    const inputUsername = req.body.username;
    const inputPassword = req.body.password;
    try{
        const response = await db.query("SELECT * FROM logins WHERE username=$1",[inputUsername]);
        const passwordMatch = await bcrypt.compare(inputPassword, response.rows[0].password);
        if(passwordMatch){
            res.render("admin_page.ejs", {pages:adminPages, currentPage:"Admin"});
        }else{
            res.render("login_page.ejs", {pages:pages, currentPage:"Login", response:"Incorrect Password"});
        }
    }catch(err){
        res.render("login_page.ejs", {pages:pages, currentPage:"Login", response:"User does not exist"});
    }
})

app.get("/admin", (req, res) => {
    res.render("admin_page.ejs", {pages:adminPages, currentPage:"Admin"});
})

app.get("/logs", async (req, res) => {
    const response = await db.query("SELECT * FROM change_logs");
    let logs = [];
    for(let x = 0; x < response.rows.length; x++){
        let currentLog = response.rows[x];
        currentLog["number"] = await getNumber(currentLog);
        logs.push(currentLog);
    }
    res.render("log_page.ejs", {pages:adminPages, currentPage:"Logs", logs: logs});
})

app.post("/admin-search", async (req, res) => {
    const requestedMovie = req.body.name.toLowerCase();
    const response = await db.query(
        `SELECT * FROM movies
        WHERE LOWER(REPLACE(REPLACE(name, '''', ''), '?', '')) = REPLACE(REPLACE(LOWER($1), '''', ''), '?', '')
        ORDER BY REPLACE(REPLACE(REPLACE(name, ' ', ''), '''', ''), '?', '') ASC`,
        [requestedMovie]
    );
    if (response.rows.length === 0){
        res.render("admin_page.ejs", {pages:adminPages, currentPage:"Admin", errorResponse:`Movie ${req.body.name} not Found`});
    }else{
        let movieData = response.rows[0];
        movieData["number"] = await getNumber(response.rows[0]);
        res.render("admin_page.ejs", {pages:adminPages, currentPage:"Admin", movieData: movieData});
    }
})

app.post("/update", async (req, res) => {
    const updateMovieName = req.body.name.toLowerCase();
    const response = await db.query(
        `SELECT * FROM movies
        WHERE LOWER(REPLACE(REPLACE(name, '''', ''), '?', '')) = REPLACE(REPLACE(LOWER($1), '''', ''), '?', '')
        ORDER BY REPLACE(REPLACE(REPLACE(name, ' ', ''), '''', ''), '?', '') ASC`,
        [updateMovieName]
        );
    if (response.rows.length === 0){
        res.render("admin_page.ejs", {pages:adminPages, currentPage:"Admin", errorResponse: `Failed, Movie: ${req.body.name} does not exist`});
    }else{
        res.render("update_page.ejs", {pages:adminPages, currentPage:"Admin", movieData: response.rows[0]});
    }
})

app.post("/update-current-movie", async (req, res) => {
    await db.query("UPDATE movies SET name = $1, location = $2, category = $3, main_actors_actresses = $4, watch_time = $5 WHERE id = $6", Object.values(req.body));
    await changeLogs(req.body, "Update");
    res.redirect("/admin");
})

app.post("/delete", async (req, res) => {
    const response = await db.query(`
        DELETE FROM movies WHERE LOWER(REPLACE(REPLACE(name, '''', ''), '?', '')) = 
        REPLACE(REPLACE(LOWER($1), '''', ''), '?', '') RETURNING *`, 
        [req.body.name.toLowerCase()]
    );
    if (response.rowCount === 0){
        res.render("admin_page.ejs", {pages:adminPages, currentPage:"Admin", response: `Failed, Movie: ${req.body.name} does not exist`});
    }else {
        await changeLogs(response.rows[0], "Delete");
        res.render("admin_page.ejs", {pages:adminPages, currentPage:"Admin", response:"Success"});
    }
});

app.listen(port, () => {
    console.log(`Server running on port: ${port}`);
})