import mongoose from "mongoose";

const connectDB = async (uri) => {
    try {
        await mongoose.connect(uri)
        console.log('Connected to database...');
        
    } catch (error) {
        console.log('Error in connectDB ' + error)
        
    }
}

export default connectDB