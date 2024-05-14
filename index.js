const express = require("express");
const app = express();
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser')
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config()
app.use(cors({
  origin: ['http://localhost:5173', 'https://job-portal-website-b20fb.web.app', 'https://job-portal-website-b20fb.firebaseapp.com'],
  credentials: true
}));
app.use(express.json());
app.use(cookieParser())
const port = process.env.PORT || 5000;







const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.iulixph.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});




const logger = (req, res, next) => {
  console.log('log info', req.method, req.url);
  next();
}
const verifyToken = (req, res, next) => {
  const token = req?.cookies?.token;
  console.log('token:', token);
  if (!token) {
    return res.status(401).send({ message: 'Unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).send({ message: 'Unauthorized access' })
    }
    req.user = decoded
    next();
  })

}



const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" ? true : false,
  sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
};

async function run() {
  try {

    // await client.connect();

    const JobCollection = client.db("allJobsDB").collection("jobs");
    const applicationCollection = client.db("allJobsDB").collection("application");
    const blogsCollection = client.db("allJobsDB").collection("blogs");
    const agentsCollection = client.db("allJobsDB").collection("AgentsDB");



    app.post('/jwt', async (req, res) => {
      const user = req.body;

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '365d', })
      res
        .cookie('token', token, cookieOptions)
        .send({ success: true })
    })


    app.post('/logout', async (req, res) => {
      const user = req.user;

      res.clearCookie("token", { ...cookieOptions, maxAge: 0 })
        .send({ success: true });
    })

    app.get('/all-jobs', async (req, res) => {
      // const sort = req.query.sort;
      const page = parseInt(req.query.page) - 1;
      const size = parseInt(req.query.size);
      const search = req.query.search;
      console.log(page, size, search);
      let query = {};
      if (search) query = {
        job_title: { $regex: search, $options: 'i' },
      }

      const result = await JobCollection.find(query).skip(page * size).limit(size).toArray();
      res.send(result)
    })

    // Get  count 
    app.get('/jobs', async (req, res) => {
      const search = req.query.search
      let query = {};
      if (search) query = {
        job_title: { $regex: search, $options: 'i' },
      }

      const count = await JobCollection.countDocuments(query)
      res.send({ count })
    })

    app.post('/all-jobs', async (req, res) => {
      const jobData = req.body;
      console.log(jobData);
      const result = await JobCollection.insertOne(jobData);
      res.send(result);
    })

    // Get My Jobs Data By Email
    app.get("/my-job-list", logger, verifyToken, async (req, res) => {
      console.log(req.query?.email);
      console.log('From my list', req.user);
      if (req.query.email !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden excess' })
      }


      const query = { employerEmail: req.query?.email }

      const result = await JobCollection.find(query).toArray();
      res.send(result)
    })




    // Get My Jobs Data By Email
    app.get("/my-application-list", logger, verifyToken, async (req, res) => {



      console.log(req.query?.email, req.query?.filter);
      if (req.query.email !== req.user.email) {
        return res.status(403).send({ message: 'Forbidden excess' })
      }
      let query = {
        applicantEmail: req.query?.email
      };
      if (req.query?.filter) query.category = req.query?.filter;
      const options = {};
      const result = await applicationCollection.find(query, options).toArray();
      res.send(result)
    })

    app.get('/job/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await JobCollection.findOne(query);
      res.send(result);
    })


    app.get('/blogs', async (req, res) => {
      const result = await blogsCollection.find().toArray();
      res.send(result);
    })
    app.get('/agents', async (req, res) => {
      const result = await agentsCollection.find().toArray();
      res.send(result);
    })

    app.get('/blog/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await blogsCollection.findOne(query);
      res.send(result);
    })

    app.get('/applicationData/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }
      const result = await applicationCollection.findOne(query);
      res.send(result);
    })


    // Save a job data in db
    app.post('/apply-now', async (req, res) => {
      const applicantData = req.body

      // check if its a duplicate request
      const query = {
        applicantEmail: applicantData.applicantEmail,
        jobId: applicantData.jobId,
      }
      const alreadyApplied = await applicationCollection.findOne(query)
      console.log('already', alreadyApplied)
      if (alreadyApplied) {
        return res.send({ message: 'You have already applied this job.' })
      }

      const result = await applicationCollection.insertOne(applicantData);

      // update job count in jobs collection
      const updateDoc = {
        $inc: { applicant_count: 1 },
      }
      const jobQuery = { _id: new ObjectId(applicantData.jobId) }
      const updateJobCount = await JobCollection.updateOne(jobQuery, updateDoc)

      res.send(result)
    })







    // update a job in db
    app.put('/update-job/:id', async (req, res) => {
      const id = req.params.id
      const jobData = req.body
      const query = { _id: new ObjectId(id) }
      const options = { upsert: true }
      const updateDoc = {
        $set: {
          ...jobData,
        },
      }
      const result = await JobCollection.updateOne(query, updateDoc, options)
      res.send(result)
    })




    // Delete a Jobs by id here
    app.delete("/delete-job/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await JobCollection.deleteOne(query);
      res.send(result)
    })




    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error

  }
}
run().catch(console.dir);



app.get('/', (req, res) => {
  res.send('Job portal server is running')
})

app.listen(port, () => {
  console.log(`Job portal is running on port${port}`);
})