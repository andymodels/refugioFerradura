import React, { useState } from 'react';
import { Layout, Button, Input, Tag, Card, message, Divider, Select, Space } from 'antd';
import { SaveOutlined, RobotOutlined, ArrowLeftOutlined } from '@ant-design/icons';

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
      if (res.ok) { 
        message.success('Publicação criada com sucesso!');
        setTitle(''); setContent(''); setSubtitle('');
      } else { message.error('Erro ao salvar no servidor.'); }
    } catch (e) { message.error('Erro de conexão.'); }
    setLoading(false);
  };
  return (
    <Layout style={{ minHeight: '100vh', background: '#141414' }}>
      <Sider width={250} style={{ background: '#000', borderRight: '1px solid #333' }}>
        <div style={{ padding: '24px', color: '#fff', fontWeight: 'bold' }}>Refúgio da Ferradura</div>
        <Button type="link" icon={<ArrowLeftOutlined />} style={{ color: '#aaa', marginLeft: '10px' }}>Voltar ao site</Button>
      </Sider>
      
      <Content style={{ padding: '60px 100px', background: '#1f1f1f' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', background: '#1f1f1f' }}>
          <Input 
            placeholder="Título da Publicação" 
            variant="borderless" 
            style={{ fontSize: '38px', fontWeight: 'bold', color: '#fff', borderBottom: '1px solid #333', padding: '10px 0' }} 
            value={title} onChange={e => setTitle(e.target.value)} 
          />
          <Input 
            placeholder="Subtítulo..." 
            variant="borderless" 
            style={{ fontSize: '20px', color: '#888', marginTop: '20px', borderBottom: '1px solid #333' }} 
            value={subtitle} onChange={e => setSubtitle(e.target.value)} 
          />
          
          <div style={{ marginTop: '30px' }}>
            {['Aventura', 'Gastronomia', 'Hospedagem', 'Eventos'].map(tag => (
              <Tag.CheckableTag 
                key={tag} 
                checked={selectedTags.includes(tag)} 
                onChange={c => setSelectedTags(c ? [...selectedTags, tag] : selectedTags.filter(t => t !== tag))}
                style={{ border: '1px solid #444', color: '#ccc', borderRadius: '4px', padding: '4px 15px' }}
              >
                {tag}
              </Tag.CheckableTag>
            ))}
          </div>
          
          <Divider style={{ borderColor: '#333' }} />
          
          <Input.TextArea 
            placeholder="Comece a escrever..." 
            variant="borderless" 
            autoSize={{ minRows: 20 }} 
            style={{ fontSize: '18px', color: '#ddd', lineHeight: '1.8' }} 
            value={content} onChange={e => setContent(e.target.value)} 
          />
        </div>
      </Content>

      <Sider width={320} style={{ background: '#141414', padding: '20px', borderLeft: '1px solid #333' }}>
        <Card title="Publicação" size="small" headStyle={{ color: '#fff', borderBottom: '1px solid #333' }} style={{ background: '#1f1f1f', borderColor: '#333' }}>
          <p style={{ color: '#aaa' }}>Status:</p>
          <Select value={status} onChange={setStatus} style={{ width: '100%', marginBottom: '20px' }} 
            dropdownStyle={{ background: '#1f1f1f' }}
            options={[{label:'Rascunho', value:'DRAFT'}, {label:'Publicado', value:'PUBLISHED'}]} />
          
          <Button type="primary" block size="large" onClick={handleSave} loading={loading} 
            style={{ background: '#d4a373', borderColor: '#d4a373', height: '50px', fontWeight: 'bold', color: '#000' }}>
            Criar Publicação
          </Button>
        </Card>
      </Sider>
    </Layout>
  );
}
