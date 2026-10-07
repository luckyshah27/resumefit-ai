import mongoose, { Schema, type Document, type Model } from 'mongoose';

export type CandidateProfile = {
  phone?: string;
  location?: string;
  college?: string;
  degree?: string;
  branch?: string;
  graduationYear?: number;
  cgpa?: string;
  linkedin?: string;
  github?: string;
  portfolio?: string;
  bio?: string;
  preferredLocations?: string[];
};

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  targetRole?: string;
  profile: CandidateProfile;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileSchema = new Schema<CandidateProfile>(
  {
    phone: String,
    location: String,
    college: String,
    degree: String,
    branch: String,
    graduationYear: Number,
    cgpa: String,
    linkedin: String,
    github: String,
    portfolio: String,
    bio: { type: String, maxlength: 600 },
    preferredLocations: [String],
  },
  { _id: false },
);

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    targetRole: { type: String, default: 'Software Engineer' },
    profile: { type: ProfileSchema, default: {} },
  },
  {
    timestamps: true,
  },
);

export const UserModel: Model<IUser> = mongoose.models.User || mongoose.model<IUser>('User', UserSchema);

export const toPublicUser = (user: IUser) => ({
  id: String(user._id),
  name: user.name,
  email: user.email,
  targetRole: user.targetRole,
  profile: user.profile ?? {},
  createdAt: user.createdAt,
});
