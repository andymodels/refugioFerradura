import { useParams } from "wouter";
import { Layout } from "@/components/layout";
import { useGetPost } from "@workspace/api-client-react";

export default function BlogPost() {
  const { slug } = useParams();
  const { data, isLoading } = useGetPost({ slug } as any);

  const post = data;

  if (isLoading) return <Layout><div className="p-10">Carregando...</div></Layout>;
  if (!post) return <Layout><div className="p-10">Post não encontrado</div></Layout>;

  // 🔥 REMOVE H1 QUE VEIO DO EDITOR
  const cleanedContent = (post.content || "").replace(/^<h1[^>]*>.*?<\/h1>/i, "");

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-20">

        <h1 className="text-4xl font-serif mb-4">
          {post.title}
        </h1>

        {post.subtitle && (
          <p className="text-lg text-primary/70 italic mb-6">
            {post.subtitle}
          </p>
        )}

        {post.coverImage && (
          <img
            src={post.coverImage}
            className="w-full rounded-lg mb-10"
          />
        )}

        <div
          className="post-content text-lg leading-relaxed"
          dangerouslySetInnerHTML={{
            __html: cleanedContent
          }}
        />

      </div>
    </Layout>
  );
}