export type SocialProfile = {
  id: string;
  display_name: string | null;
  avatar_key: string | null;
  avatar_path: string | null;
  cover_path: string | null;
  bio: string | null;
  status: string | null;
  is_private: boolean;
  allow_message_requests: boolean;
};

export type FollowStatus = 'none' | 'pending' | 'accepted';

export type ProfilePostMedia = {
  id: string;
  post_id: string;
  owner_user_id: string;
  media_type: 'image' | 'video';
  storage_path: string;
  mime_type: string;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  sort_order: number;
  signed_url?: string;
};

export type ProfilePost = {
  id: string;
  user_id: string;
  caption: string;
  status: 'published' | 'deleted';
  created_at: string;
  updated_at: string;
  profile_post_media: ProfilePostMedia[];
};

export type ConversationStatus = 'pending' | 'accepted' | 'declined' | 'blocked';

export type DirectConversation = {
  id: string;
  requester_user_id: string;
  recipient_user_id: string;
  status: ConversationStatus;
  accepted_at: string | null;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DirectMessage = {
  id: string;
  conversation_id: string;
  sender_user_id: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type ConversationSummary = DirectConversation & {
  partner: SocialProfile | null;
  latest_message: DirectMessage | null;
  unread_count: number;
};
