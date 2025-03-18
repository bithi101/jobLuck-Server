import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';

dotenv.config(); // Load environment variables

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://jobluck-8d758.web.app',
        'https://jobluck-8d758.firebaseapp.com'
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// JWT Verification Middleware
const verifyToken = (req, res, next) => {
    const token = req.cookies?.token;

    if (!token) {
        return res.status(401).send({ message: 'unauthorized access' });
    }

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorized access' });
        }
        req.user = decoded;
        next();
    });
};

// MongoDB Connection
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4tto.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Database Collections
        const jobsCollection = client.db('jobPortal').collection('jobs');
        const jobApplicationCollection = client.db('jobPortal').collection('job_applications');

        // Authentication Routes
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '10h' });

            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
                })
                .send({ success: true });
        });

        app.post('/logout', (req, res) => {
            res
                .clearCookie('token', {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict'
                })
                .send({ success: true });
        });

        // Jobs Routes
        app.get('/jobs', async (req, res) => {
            const email = req.query.email;
            let query = {};
            if (email) {
                query = { hr_email: email };
            }
            const result = await jobsCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await jobsCollection.findOne(query);
            res.send(result);
        });

        app.post('/jobs', async (req, res) => {
            const newJob = req.body;
            const result = await jobsCollection.insertOne(newJob);
            res.send(result);
        });

        // Job Application Routes
        app.get('/job-application', verifyToken, async (req, res) => {
            const email = req.query.email;
            const query = { applicant_email: email };

            if (req.user.email !== req.query.email) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const result = await jobApplicationCollection.find(query).toArray();

            for (const application of result) {
                const jobQuery = { _id: new ObjectId(application.job_id) };
                const job = await jobsCollection.findOne(jobQuery);
                if (job) {
                    application.title = job.title;
                    application.location = job.location;
                    application.company = job.company;
                    application.company_logo = job.company_logo;
                }
            }

            res.send(result);
        });

        app.get('/job-applications/jobs/:job_id', async (req, res) => {
            const jobId = req.params.job_id;
            const query = { job_id: jobId };
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/job-applications', async (req, res) => {
            const application = req.body;
            const result = await jobApplicationCollection.insertOne(application);

            const id = application.job_id;
            const jobQuery = { _id: new ObjectId(id) };
            const job = await jobsCollection.findOne(jobQuery);

            let newCount = (job?.applicationCount || 0) + 1;

            const filter = { _id: new ObjectId(id) };
            const updatedDoc = { $set: { applicationCount: newCount } };

            await jobsCollection.updateOne(filter, updatedDoc);

            res.send(result);
        });

        app.patch('/job-applications/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = { $set: { status: data.status } };

            const result = await jobApplicationCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}

run().catch(console.dir);

// Root Route
app.get('/', (req, res) => {
    res.send('Job is falling from the sky');
});

// Start Server
app.listen(port, () => {
    console.log(`Job is waiting at: ${port}`);
});
