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
    if (!title || !content) return message.warning('Preencha o título e o conteúdo.');
    setLoading(true);
    try {
      const payload = {
        title,
        subtitle,
        content,
        excerpt: subtitle || title.substring(0, 100),
        slug: title.toLowerCase().replace(/ /g, '-').replace(/[^\w-]+/g, ''),
        status,
        authorId: 1,
        coverImage: "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
        tags: selectedTags
      };

      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        message.success('Publicação criada com sucesso!');
        setTitle(''); setContent(''); setSubtitle('');
      } else {
        const errorData = await res.json();
        message.error('Erro no servidor: ' + (errorData.message || 'Verifique os dados.'));
      }
    } catch (e) {
      message.error('Erro de conexão com o servidor.');
    }
    setLoading(false);
  };

  return (
    <Layout style={{ background: '#fff', minHeight: '100vh' }}>
      <Content style={{ padding: '40px', maxWidth: '800px', margin: '0 auto' }}>
        <Input 
          placeholder="Título da Publicação" 
          variant="borderless" 
          style={{ fontSize: '32px', fontWeight: 'bold', borderBottom: '1px solid #eee', borderRadius: 0 }} 
          value={title} 
          onChange={e => setTitle(e.target.value)} 
        />
        <Input 
          placeholder="Subtítulo..." 
          variant="borderless" 
          style={{ fontSize: '18px', borderBottom: '1px solid #eee', marginTop: '10px', borderRadius: 0 }} 
          value={subtitle} 
          onChange={e => setSubtitle(e.target.value)} 
        />
        <div style={{ marginTop: '20px' }}>
          {['Aventura', 'Gastronomia', 'Hospedagem', 'Eventos'].map(tag => (
            <Tag.CheckableTag 
              key={tag} 
              checked={selectedTags.includes(tag)} 
              onChange={c => setSelectedTags(c ? [...selectedTags, tag] : selectedTags.filter(t => t !== tag))}
              style={{ border: '1px solid #ddd', padding: '4px 12px', borderRadius: '15px' }}
            >
              {tag}
            </Tag.CheckableTag>
          ))}
        </div>
        <Divider />
        <Input.TextArea 
          placeholder="Escreva sua matéria aqui..." 
          variant="borderless" 
          autoSize={{ minRows: 15 }} 
          style={{ fontSize: '16px' }} 
          value={content} 
          onChange={e => setContent(e.target.value)} 
        />
      </Content>
      <Sider width={300} theme="light" style={{ borderLeft: '1px solid #eee', padding: '20px' }}>
        <Card title="IA GPT-4o" size="small">
          <Input.Search placeholder="Link para gerar..." enterButton={<RobotOutlined />} />
        </Card>
        <Card title="Status & Publicação" size="small" style={{ marginTop: '20px' }}>
          <Select value={status} onChange={setStatus} style={{ width: '100%' }} options={[{label:'Rascunho', value:'DRAFT'}, {label:'Publicado', value:'PUBLISHED'}]} />
          <Button type="primary" block size="large" onClick={handleSave} loading={loading} style={{ marginTop: '20px', background: '#222' }}>
            Criar Publicação
          </Button>
        </Card>
      </Sider>
    </Layout>
  );
}
