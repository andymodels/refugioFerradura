import React, { useState } from 'react';
import { Layout, Button, Input, Tag, Card, message, Divider, Select } from 'antd';
import { SaveOutlined, RobotOutlined } from '@ant-design/icons';
const { Content, Sider } = Layout;

export default function EditorPage() {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [subtitle, setSubtitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [status, setStatus] = useState('PUBLISHED');

  const handleSave = async () => {
    if (!title || !content) return message.warning('Preencha título e conteúdo.');
    setLoading(true);
    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, subtitle, content,
          excerpt: subtitle || title.substring(0, 100),
          slug: title.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_-]+/g, '-'),
          status, authorId: 1,
          coverImage: "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
          tags: selectedTags
        }),
      });
      if (res.ok) { message.success('Publicação criada!'); setTitle(''); setContent(''); }
      else { message.error('Erro no servidor.'); }
    } catch (e) { message.error('Erro de conexão.'); }
    setLoading(false);
  };
  return (
    <Layout style={{ background: '#fff', minHeight: '100vh' }}>
      <Content style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        <Input placeholder="Título" variant="borderless" style={{ fontSize: '32px', fontWeight: 'bold', borderBottom: '1px solid #eee' }} value={title} onChange={e => setTitle(e.target.value)} />
        <Input placeholder="Subtítulo..." variant="borderless" style={{ fontSize: '18px', borderBottom: '1px solid #eee', marginTop: '10px' }} value={subtitle} onChange={e => setSubtitle(e.target.value)} />
        <div style={{ marginTop: '20px' }}>
          {['Aventura', 'Gastronomia', 'Hospedagem'].map(tag => (
            <Tag.CheckableTag key={tag} checked={selectedTags.includes(tag)} onChange={c => setSelectedTags(c ? [...selectedTags, tag] : selectedTags.filter(t => t !== tag))} style={{ border: '1px solid #ddd', borderRadius: '15px' }}>{tag}</Tag.CheckableTag>
          ))}
        </div>
        <Divider />
        <Input.TextArea placeholder="Conteúdo..." variant="borderless" autoSize={{ minRows: 15 }} value={content} onChange={e => setContent(e.target.value)} />
      </Content>
      <Sider width={300} theme="light" style={{ borderLeft: '1px solid #eee', padding: '20px' }}>
        <Card title="Status" size="small">
          <Select value={status} onChange={setStatus} style={{ width: '100%' }} options={[{label:'Rascunho', value:'DRAFT'}, {label:'Publicado', value:'PUBLISHED'}]} />
          <Button type="primary" block onClick={handleSave} loading={loading} style={{ marginTop: '20px', background: '#222' }}>Criar Publicação</Button>
        </Card>
      </Sider>
    </Layout>
  );
}
