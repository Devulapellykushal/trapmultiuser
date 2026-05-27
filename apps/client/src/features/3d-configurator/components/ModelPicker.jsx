import shoe from '../assets/img/shoe.png';
import rocket from '../assets/img/rocket.png';
import axe from '../assets/img/axe.png';
import insect from '../assets/img/insect.png';
import teapot from '../assets/img/teapot.png';

export default function ModelPicker({ updateSelectedModel }) {
  return (
    <div className="model-selector">
      <div onClick={() => updateSelectedModel('Shoe')} onKeyDown={(e) => e.key === 'Enter' && updateSelectedModel('Shoe')} role="button" tabIndex={0}>
        <img src={shoe} alt="Shoe" />
        <h4>Shoe</h4>
      </div>
      <div onClick={() => updateSelectedModel('Rocket')} onKeyDown={(e) => e.key === 'Enter' && updateSelectedModel('Rocket')} role="button" tabIndex={0}>
        <img src={rocket} alt="Rocket" />
        <h4>Rocket</h4>
      </div>
      <div onClick={() => updateSelectedModel('Axe')} onKeyDown={(e) => e.key === 'Enter' && updateSelectedModel('Axe')} role="button" tabIndex={0}>
        <img src={axe} alt="Axe" />
        <h4>Axe</h4>
      </div>
      <div onClick={() => updateSelectedModel('Insect')} onKeyDown={(e) => e.key === 'Enter' && updateSelectedModel('Insect')} role="button" tabIndex={0}>
        <img src={insect} alt="Insect" />
        <h4>Insect</h4>
      </div>
      <div onClick={() => updateSelectedModel('Teapot')} onKeyDown={(e) => e.key === 'Enter' && updateSelectedModel('Teapot')} role="button" tabIndex={0}>
        <img src={teapot} alt="Teapot" />
        <h4>Teapot</h4>
      </div>
    </div>
  );
}
